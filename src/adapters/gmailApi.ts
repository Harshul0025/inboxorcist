import { GMAIL_BATCH_MODIFY_MAX, GMAIL_LIST_PAGE_SIZE, REQUEST_TIMEOUT_MS } from '../../shared/constants';
import { cleanText } from '../../shared/text';
import type { EmailItem } from '../../shared/types';
import { chunk, withRetry } from '../lib/async';
import { parseFromHeader } from '../lib/grouping';
import type { TokenManager } from './googleAuth';

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

/** Error returned by the Gmail API. */
export class GmailApiError extends Error {
  override name = 'GmailApiError';
  constructor(
    readonly status: number,
    readonly reason: string | undefined,
    message: string,
  ) {
    super(message);
  }

  /** True for errors worth retrying (rate limits, transient server errors). */
  get retryable(): boolean {
    return RETRYABLE_STATUS.has(this.status) || (this.status === 403 && RATE_LIMIT_REASONS.has(this.reason ?? ''));
  }
}

interface MessageRef {
  id: string;
  threadId: string;
}

interface Header {
  name: string;
  value: string;
}

interface MessageMetadata {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: { headers?: Header[] };
}

interface Label {
  id: string;
  name: string;
  messagesUnread?: number;
}

export interface ListQuery {
  q?: string;
  labelIds?: readonly string[];
  /** Stop after this many ids; omit to read every page. */
  max?: number;
}

export interface GmailApi {
  listIds(query: ListQuery): Promise<MessageRef[]>;
  getMetadata(id: string): Promise<EmailItem>;
  batchModify(ids: readonly string[], add: readonly string[], remove: readonly string[]): Promise<void>;
  unreadCount(labelId: string): Promise<number>;
  findLabel(name: string): Promise<string | null>;
  ensureLabel(name: string): Promise<string>;
  createFilter(from: string): Promise<string>;
  deleteFilter(id: string): Promise<void>;
  createDraft(raw: string, threadId: string): Promise<void>;
}

/**
 * Extracts an RFC 8058 one-click unsubscribe URL from message headers.
 * @param listUnsubscribe `List-Unsubscribe` header value.
 * @param listUnsubscribePost `List-Unsubscribe-Post` header value.
 * @returns The HTTPS URL, or undefined when one-click is not supported.
 */
export function oneClickUrl(listUnsubscribe?: string, listUnsubscribePost?: string): string | undefined {
  if (!listUnsubscribe || !/List-Unsubscribe=One-Click/i.test(listUnsubscribePost ?? '')) return undefined;
  const match = /<(https:\/\/[^>]+)>/i.exec(listUnsubscribe);
  return match?.[1];
}

/**
 * Converts a Gmail metadata response into an EmailItem.
 * @param message `users.messages.get` response with `format=metadata`.
 */
export function toEmailItem(message: MessageMetadata): EmailItem {
  const headers = new Map((message.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const from = parseFromHeader(headers.get('from') ?? 'unknown@unknown');
  const unsubscribeUrl = oneClickUrl(headers.get('list-unsubscribe'), headers.get('list-unsubscribe-post'));
  const messageIdHeader = headers.get('message-id');
  return {
    id: message.id,
    threadId: message.threadId,
    senderEmail: from.email,
    senderName: from.name,
    subject: cleanText(headers.get('subject') ?? '(no subject)'),
    snippet: cleanText(decodeEntities(message.snippet ?? '')),
    ...(messageIdHeader ? { messageIdHeader } : {}),
    ...(unsubscribeUrl ? { unsubscribeUrl } : {}),
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Thin, typed Gmail REST client with retries, timeouts and token refresh.
 * Calls go straight from the browser to Google; our server never sees them.
 * @param tokens Access token manager.
 * @param deps Injectable fetch and backoff wait (for tests).
 */
export function createGmailApi(
  tokens: TokenManager,
  deps: { fetchImpl?: typeof fetch; wait?: (ms: number) => Promise<void> } = {},
): GmailApi {
  const fetchImpl = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const labelCache = new Map<string, string>();

  async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
    let reauthorised = false;
    return withRetry(
      async () => {
        const token = await tokens.getToken();
        const response = await fetchImpl(`${BASE_URL}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (response.status === 401 && !reauthorised) {
          reauthorised = true;
          tokens.invalidate();
          throw new GmailApiError(401, 'reauth', 'Access token expired');
        }
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: { message?: string; errors?: { reason?: string }[] };
          };
          throw new GmailApiError(
            response.status,
            payload.error?.errors?.[0]?.reason,
            payload.error?.message ?? `Gmail API ${response.status}`,
          );
        }
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      },
      {
        shouldRetry: (error) =>
          (error instanceof GmailApiError && (error.retryable || error.reason === 'reauth')) ||
          // Network failures (TypeError) and request timeouts are transient.
          error instanceof TypeError ||
          (error instanceof DOMException && error.name === 'TimeoutError'),
        ...(deps.wait ? { wait: deps.wait } : {}),
      },
    );
  }

  async function listLabels(): Promise<Label[]> {
    const result = await send<{ labels?: Label[] }>('GET', '/labels');
    return result.labels ?? [];
  }

  const api: GmailApi = {
    async listIds({ q, labelIds, max }) {
      const refs: MessageRef[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({ maxResults: String(GMAIL_LIST_PAGE_SIZE) });
        if (q) params.set('q', q);
        for (const id of labelIds ?? []) params.append('labelIds', id);
        if (pageToken) params.set('pageToken', pageToken);
        const page = await send<{ messages?: MessageRef[]; nextPageToken?: string }>(
          'GET',
          `/messages?${params.toString()}`,
        );
        refs.push(...(page.messages ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken && (max === undefined || refs.length < max));
      return max === undefined ? refs : refs.slice(0, max);
    },

    async getMetadata(id) {
      const params = new URLSearchParams({ format: 'metadata' });
      for (const header of ['From', 'Subject', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'Message-ID']) {
        params.append('metadataHeaders', header);
      }
      return toEmailItem(
        await send<MessageMetadata>('GET', `/messages/${encodeURIComponent(id)}?${params.toString()}`),
      );
    },

    async batchModify(ids, add, remove) {
      for (const part of chunk(ids, GMAIL_BATCH_MODIFY_MAX)) {
        await send('POST', '/messages/batchModify', { ids: part, addLabelIds: add, removeLabelIds: remove });
      }
    },

    async unreadCount(labelId) {
      const label = await send<Label>('GET', `/labels/${encodeURIComponent(labelId)}`);
      return label.messagesUnread ?? 0;
    },

    async findLabel(name) {
      const cached = labelCache.get(name);
      if (cached) return cached;
      const label = (await listLabels()).find((candidate) => candidate.name === name);
      if (label) labelCache.set(name, label.id);
      return label?.id ?? null;
    },

    async ensureLabel(name) {
      const existing = await api.findLabel(name);
      if (existing) return existing;
      const label = await send<Label>('POST', '/labels', {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      });
      labelCache.set(name, label.id);
      return label.id;
    },

    async createFilter(from) {
      const filter = await send<{ id: string }>('POST', '/settings/filters', {
        criteria: { from },
        action: { removeLabelIds: ['INBOX'] },
      });
      return filter.id;
    },

    async deleteFilter(id) {
      await send('DELETE', `/settings/filters/${encodeURIComponent(id)}`);
    },

    async createDraft(raw, threadId) {
      await send('POST', '/drafts', { message: { raw, threadId } });
    },
  };
  return api;
}
