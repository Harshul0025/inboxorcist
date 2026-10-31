import { describe, expect, it, vi } from 'vitest';
import type { EmailItem } from '../../../shared/types';
import type { GmailApi } from '../../../src/adapters/gmailApi';
import { GmailAdapter, runLabelName, senderQuery } from '../../../src/adapters/GmailAdapter';
import { GMAIL_COMPOSE_SCOPE, GMAIL_SETTINGS_SCOPE, type TokenManager } from '../../../src/adapters/googleAuth';
import type { ApiClient } from '../../../src/lib/api';

const email: EmailItem = {
  id: 'm1',
  threadId: 't1',
  senderEmail: 'riya@gmail.com',
  senderName: 'Riya',
  subject: 'Meet?',
  snippet: 'tonight',
  messageIdHeader: '<m1@mail>',
};

function setup() {
  const gmail = {
    listIds: vi.fn<GmailApi['listIds']>(() => Promise.resolve([{ id: 'm1', threadId: 't1' }])),
    getMetadata: vi.fn<GmailApi['getMetadata']>(() => Promise.resolve(email)),
    batchModify: vi.fn<GmailApi['batchModify']>(() => Promise.resolve()),
    unreadCount: vi.fn<GmailApi['unreadCount']>(() => Promise.resolve(4321)),
    findLabel: vi.fn<GmailApi['findLabel']>(() => Promise.resolve('RUN')),
    ensureLabel: vi.fn<GmailApi['ensureLabel']>((name) => Promise.resolve(name.endsWith('Needs-Reply') ? 'NR' : 'RUN')),
    createFilter: vi.fn<GmailApi['createFilter']>(() => Promise.resolve('F1')),
    deleteFilter: vi.fn<GmailApi['deleteFilter']>(() => Promise.resolve()),
    createDraft: vi.fn<GmailApi['createDraft']>(() => Promise.resolve()),
  } satisfies GmailApi;
  const tokens: TokenManager = {
    getToken: vi.fn(() => Promise.resolve('tok')),
    ensureScopes: vi.fn(() => Promise.resolve()),
    hasScopes: vi.fn(() => true),
    invalidate: vi.fn(),
    revoke: vi.fn(),
  };
  const api = { unsubscribe: vi.fn(() => Promise.resolve(true)) } as unknown as ApiClient;
  return { gmail, tokens, api, adapter: new GmailAdapter(gmail, tokens, api) };
}

describe('senderQuery', () => {
  it('builds a scoped query and rejects injection attempts', () => {
    expect(senderQuery('offers@swiggy.in')).toBe('is:unread in:inbox from:(offers@swiggy.in)');
    expect(() => senderQuery('a@b.co) OR (in:anywhere')).toThrow();
    expect(() => senderQuery('not-an-email')).toThrow();
  });

  it('namespaces run labels', () => {
    expect(runLabelName('run-1')).toBe('Inboxorcist/run-1');
  });
});

describe('GmailAdapter', () => {
  it('scans the exact unread count and a metadata sample', async () => {
    const { adapter, gmail } = setup();
    const scan = await adapter.scan();
    expect(scan.totalUnread).toBe(4321);
    expect(scan.groups[0]).toMatchObject({ sender: 'riya@gmail.com', count: 1 });
    expect(gmail.listIds).toHaveBeenCalledWith({ q: 'is:unread in:inbox', max: 300 });
    expect(await adapter.unreadCount()).toBe(4321);
  });

  it('banishes by marking read, archiving and tagging with the run label', async () => {
    const { adapter, gmail } = setup();
    expect(await adapter.idsForSender('offers@swiggy.in')).toEqual(['m1']);
    await adapter.apply('banish', ['m1', 'm2'], 'run-1');
    expect(gmail.ensureLabel).toHaveBeenCalledWith('Inboxorcist/run-1');
    expect(gmail.batchModify).toHaveBeenCalledWith(['m1', 'm2'], ['RUN'], ['UNREAD', 'INBOX']);
  });

  it('rescues by starring and labelling for reply, never archiving', async () => {
    const { adapter, gmail } = setup();
    await adapter.apply('rescue', ['m1'], 'run-1');
    expect(gmail.batchModify).toHaveBeenCalledWith(['m1'], ['STARRED', 'NR'], []);
    await adapter.apply('banish', [], 'run-1');
    expect(gmail.batchModify).toHaveBeenCalledTimes(1);
  });

  it('seals with a filter (incremental scope) and one-click unsubscribe, and undo removes it', async () => {
    const { adapter, gmail, tokens, api } = setup();
    expect(await adapter.seal({ sender: 'offers@swiggy.in', unsubscribeUrl: 'https://s.in/u' }, 'run-1')).toEqual({
      filtered: true,
      unsubscribed: true,
    });
    expect(tokens.ensureScopes).toHaveBeenCalledWith([GMAIL_SETTINGS_SCOPE]);
    expect(api.unsubscribe).toHaveBeenCalledWith('https://s.in/u');
    expect(await adapter.seal({ sender: 'x@y.co' }, 'run-1')).toEqual({ filtered: true, unsubscribed: false });

    expect(await adapter.undo('run-1')).toBe(1);
    expect(gmail.batchModify).toHaveBeenCalledWith(['m1'], ['INBOX', 'UNREAD'], ['RUN']);
    expect(gmail.deleteFilter).toHaveBeenCalledTimes(2);
  });

  it('undo is a no-op when the run never banished anything', async () => {
    const { adapter, gmail } = setup();
    gmail.findLabel.mockResolvedValueOnce(null);
    expect(await adapter.undo('run-none')).toBe(0);
    expect(gmail.batchModify).not.toHaveBeenCalled();
  });

  it('creates threaded reply drafts after asking for the compose scope', async () => {
    const { adapter, gmail, tokens } = setup();
    await adapter.enableDrafts();
    await adapter.createDraft(email, 'Sure!');
    const { messageIdHeader: _unused, ...withoutMessageId } = email;
    await adapter.createDraft(withoutMessageId, 'Ok');
    expect(tokens.ensureScopes).toHaveBeenCalledWith([GMAIL_COMPOSE_SCOPE]);
    expect(gmail.createDraft).toHaveBeenCalledWith(expect.any(String), 't1');
  });
});
