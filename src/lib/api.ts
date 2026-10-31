import type { z } from 'zod';
import { fallbackProposal } from '../../shared/classifier';
import { AI_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../../shared/constants';
import { fallbackDraft, fallbackRoast } from '../../shared/fallbacks';
import {
  draftReplySchema,
  proposalSchema,
  publicConfigSchema,
  roastSchema,
  unsubscribeResponseSchema,
} from '../../shared/schemas';
import type {
  DraftReply,
  DraftRequest,
  Proposal,
  PublicConfig,
  Roast,
  RunStats,
  SenderGroup,
} from '../../shared/types';

export const APP_CHECK_HEADER = 'X-Firebase-AppCheck';

/** Thrown for non-2xx API responses. */
export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiClient {
  config(): Promise<PublicConfig>;
  propose(groups: readonly SenderGroup[]): Promise<Proposal>;
  roast(stats: RunStats, categories: readonly string[]): Promise<Roast>;
  draft(request: DraftRequest): Promise<DraftReply>;
  unsubscribe(url: string): Promise<boolean>;
}

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Timeout for calls that wait on Gemini (propose, roast, draft). */
  aiTimeoutMs?: number;
  /** Returns a Firebase App Check token, or null when App Check is off. */
  getAppCheckToken?: () => Promise<string | null>;
}

const OFFLINE_CONFIG: PublicConfig = {
  googleClientId: null,
  firebase: null,
  recaptchaSiteKey: null,
  useEmulators: false,
};

/**
 * Creates the browser client for the Inboxorcist API. Gameplay calls fall
 * back to local rule-based results, so the game works even if the API or
 * Gemini is down.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const aiTimeoutMs = options.aiTimeoutMs ?? AI_REQUEST_TIMEOUT_MS;

  async function call<S extends z.ZodType>(
    path: string,
    schema: S,
    body?: unknown,
    timeout: number = timeoutMs,
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = options.getAppCheckToken ? await options.getAppCheckToken() : null;
    if (token) headers[APP_CHECK_HEADER] = token;

    const response = await fetchImpl(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(timeout),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new ApiError(response.status, `API ${path} failed with ${response.status}`);
    return schema.parse(await response.json());
  }

  return {
    async config() {
      try {
        return await call('config', publicConfigSchema);
      } catch {
        return OFFLINE_CONFIG;
      }
    },
    async propose(groups) {
      try {
        return await call('propose', proposalSchema, { groups }, aiTimeoutMs);
      } catch {
        return fallbackProposal(groups);
      }
    },
    async roast(stats, categories) {
      try {
        return await call('roast', roastSchema, { stats, categories }, aiTimeoutMs);
      } catch {
        return fallbackRoast(stats);
      }
    },
    async draft(request) {
      try {
        return await call('draft', draftReplySchema, request, aiTimeoutMs);
      } catch {
        return fallbackDraft(request);
      }
    },
    async unsubscribe(url) {
      try {
        const result = await call('unsubscribe', unsubscribeResponseSchema, { url });
        return result.ok;
      } catch {
        return false;
      }
    },
  };
}
