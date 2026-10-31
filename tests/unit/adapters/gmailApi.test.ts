import { describe, expect, it, vi } from 'vitest';
import { createGmailApi, GmailApiError, oneClickUrl, toEmailItem } from '../../../src/adapters/gmailApi';
import type { TokenManager } from '../../../src/adapters/googleAuth';

function tokens(): TokenManager & { invalidate: ReturnType<typeof vi.fn<() => void>> } {
  return {
    getToken: vi.fn(() => Promise.resolve('tok')),
    ensureScopes: vi.fn(() => Promise.resolve()),
    hasScopes: vi.fn(() => true),
    invalidate: vi.fn<() => void>(),
    revoke: vi.fn(),
  };
}

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

const noWait = () => Promise.resolve();

describe('header parsing', () => {
  it('only returns HTTPS one-click unsubscribe URLs', () => {
    expect(oneClickUrl('<mailto:u@x.com>, <https://x.com/u?id=1>', 'List-Unsubscribe=One-Click')).toBe(
      'https://x.com/u?id=1',
    );
    expect(oneClickUrl('<https://x.com/u>', undefined)).toBeUndefined();
    expect(oneClickUrl('<http://x.com/u>', 'List-Unsubscribe=One-Click')).toBeUndefined();
    expect(oneClickUrl(undefined, 'List-Unsubscribe=One-Click')).toBeUndefined();
  });

  it('converts metadata into an EmailItem', () => {
    const item = toEmailItem({
      id: 'm1',
      threadId: 't1',
      snippet: 'Tom &amp; Jerry&#39;s &quot;deal&quot; &lt;today&gt;',
      payload: {
        headers: [
          { name: 'From', value: 'Swiggy <offers@swiggy.in>' },
          { name: 'Subject', value: 'Deal\r\nnow' },
          { name: 'Message-ID', value: '<abc@swiggy.in>' },
          { name: 'List-Unsubscribe', value: '<https://swiggy.in/u>' },
          { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
        ],
      },
    });
    expect(item).toEqual({
      id: 'm1',
      threadId: 't1',
      senderEmail: 'offers@swiggy.in',
      senderName: 'Swiggy',
      subject: 'Deal now',
      snippet: 'Tom & Jerry\'s "deal" <today>',
      messageIdHeader: '<abc@swiggy.in>',
      unsubscribeUrl: 'https://swiggy.in/u',
    });
    expect(toEmailItem({ id: 'm2', threadId: 't2' }).subject).toBe('(no subject)');
  });
});

describe('createGmailApi', () => {
  it('paginates message lists and stops at max', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(200, { messages: [{ id: '1', threadId: '1' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(
        respond(200, {
          messages: [
            { id: '2', threadId: '2' },
            { id: '3', threadId: '3' },
          ],
        }),
      );
    const api = createGmailApi(tokens(), { fetchImpl, wait: noWait });
    const refs = await api.listIds({ q: 'is:unread', labelIds: ['L1'], max: 2 });
    expect(refs.map((r) => r.id)).toEqual(['1', '2']);
    const firstUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(firstUrl).toContain('q=is%3Aunread');
    expect(firstUrl).toContain('labelIds=L1');
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('pageToken=p2');
  });

  it('reads every page when there is no max', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(respond(200, {}));
    const api = createGmailApi(tokens(), { fetchImpl, wait: noWait });
    expect(await api.listIds({})).toEqual([]);
  });

  it('batch-modifies in chunks of 1000 with the bearer token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(respond(204)));
    const api = createGmailApi(tokens(), { fetchImpl, wait: noWait });
    const ids = Array.from({ length: 2500 }, (_, i) => String(i));
    await api.batchModify(ids, ['L'], ['UNREAD', 'INBOX']);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [, init] = fetchImpl.mock.calls[2] ?? [];
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init?.body))).toMatchObject({ addLabelIds: ['L'], removeLabelIds: ['UNREAD', 'INBOX'] });
    expect(JSON.parse(String(init?.body)).ids).toHaveLength(500);
  });

  it('retries rate limits and transient failures', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(429, { error: { message: 'slow down' } }))
      .mockResolvedValueOnce(
        respond(403, { error: { message: 'quota', errors: [{ reason: 'userRateLimitExceeded' }] } }),
      )
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(respond(200, { id: 'INBOX', name: 'INBOX', messagesUnread: 42 }));
    const api = createGmailApi(tokens(), { fetchImpl, wait: noWait });
    expect(await api.unreadCount('INBOX')).toBe(42);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('refreshes the token once after a 401', async () => {
    const manager = tokens();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(401))
      .mockResolvedValueOnce(respond(200, { id: 'INBOX', name: 'INBOX' }));
    const api = createGmailApi(manager, { fetchImpl, wait: noWait });
    expect(await api.unreadCount('INBOX')).toBe(0);
    expect(manager.invalidate).toHaveBeenCalledTimes(1);
  });

  it('does not retry permanent errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(respond(403, { error: { message: 'Forbidden' } })));
    const api = createGmailApi(tokens(), { fetchImpl, wait: noWait });
    const error = await api.unreadCount('INBOX').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GmailApiError);
    expect((error as GmailApiError).retryable).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('finds, creates and caches labels', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(200, { labels: [{ id: 'L1', name: 'Other' }] }))
      .mockResolvedValueOnce(respond(200, { id: 'L2', name: 'Inboxorcist/run' }));
    const api = createGmailApi(tokens(), { fetchImpl, wait: noWait });
    expect(await api.ensureLabel('Inboxorcist/run')).toBe('L2');
    expect(await api.ensureLabel('Inboxorcist/run')).toBe('L2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gets metadata, filters and drafts', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respond(200, { id: 'm1', threadId: 't1', payload: { headers: [{ name: 'From', value: 'a@b.co' }] } }),
      )
      .mockResolvedValueOnce(respond(200, { id: 'f1' }))
      .mockResolvedValueOnce(respond(204))
      .mockResolvedValueOnce(respond(200, { id: 'd1' }));
    const api = createGmailApi(tokens(), { fetchImpl, wait: noWait });
    expect((await api.getMetadata('m1')).senderEmail).toBe('a@b.co');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('metadataHeaders=List-Unsubscribe-Post');
    expect(await api.createFilter('a@b.co')).toBe('f1');
    await api.deleteFilter('f1');
    expect(fetchImpl.mock.calls[2]?.[1]?.method).toBe('DELETE');
    await api.createDraft('raw', 't1');
    expect(JSON.parse(String(fetchImpl.mock.calls[3]?.[1]?.body))).toEqual({ message: { raw: 'raw', threadId: 't1' } });
  });
});
