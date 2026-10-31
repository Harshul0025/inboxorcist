import { describe, expect, it, vi } from 'vitest';
import type { RunStats } from '../../../shared/types';
import { APP_CHECK_HEADER, createApiClient } from '../../../src/lib/api';

const stats: RunStats = {
  cleared: 1,
  rescued: 0,
  kept: 0,
  sealed: 0,
  bossesDefeated: 0,
  durationMs: 1,
  unreadBefore: 1,
  unreadAfter: 0,
  bestCombo: 0,
  score: 10,
};
const groups = [{ sender: 'offers@swiggy.in', senderName: 'Swiggy', count: 3, samples: [] }];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

describe('createApiClient', () => {
  it('sends JSON with the App Check token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => json({ lines: ['a', 'b'], source: 'gemini' }));
    const api = createApiClient({ fetchImpl, getAppCheckToken: () => Promise.resolve('token-123') });
    await expect(api.roast(stats, ['Food'])).resolves.toEqual({ lines: ['a', 'b'], source: 'gemini' });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('/api/roast');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)[APP_CHECK_HEADER]).toBe('token-123');
  });

  it('falls back locally when the API fails or returns garbage', async () => {
    const failing = createApiClient({ fetchImpl: () => json({ error: 'x' }, 500) });
    expect((await failing.propose(groups)).source).toBe('fallback');
    expect((await failing.roast(stats, [])).source).toBe('fallback');
    expect((await failing.draft({ senderName: 'A', subject: 'B', snippet: '' })).source).toBe('fallback');
    expect(await failing.unsubscribe('https://x.example/u')).toBe(false);
    expect(await failing.config()).toMatchObject({ googleClientId: null, firebase: null });

    const garbage = createApiClient({ fetchImpl: () => json({ verdicts: 'nope' }) });
    expect((await garbage.propose(groups)).source).toBe('fallback');
  });

  it('parses successful responses', async () => {
    const api = createApiClient({
      fetchImpl: (input) => {
        const path = String(input);
        if (path.endsWith('config'))
          return json({ googleClientId: 'cid', firebase: null, recaptchaSiteKey: null, useEmulators: false });
        if (path.endsWith('unsubscribe')) return json({ ok: true, status: 200 });
        return json({ body: 'Hello', source: 'gemini' });
      },
    });
    expect((await api.config()).googleClientId).toBe('cid');
    expect(await api.unsubscribe('https://x.example/u')).toBe(true);
    expect((await api.draft({ senderName: 'A', subject: 'B', snippet: '' })).body).toBe('Hello');
  });
});
