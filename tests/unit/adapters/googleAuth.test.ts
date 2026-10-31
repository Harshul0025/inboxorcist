import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthError,
  createTokenManager,
  GMAIL_COMPOSE_SCOPE,
  GMAIL_MODIFY_SCOPE,
  type GisOauth2,
  loadGisOauth2,
  type TokenClient,
  type TokenResponse,
} from '../../../src/adapters/googleAuth';

type Responder = (overrides?: { prompt?: string; scope?: string }) => TokenResponse | { errorType: string };

function fakeGis(respond: Responder) {
  const requests: { prompt?: string; scope?: string }[] = [];
  let errorCallback: ((error: { type?: string }) => void) | undefined;
  const revoke = vi.fn();
  const oauth2: GisOauth2 = {
    initTokenClient(config) {
      errorCallback = config.error_callback;
      const client: TokenClient = {
        callback: config.callback,
        requestAccessToken(overrides) {
          requests.push(overrides ?? {});
          const response = respond(overrides);
          queueMicrotask(() => {
            if ('errorType' in response) errorCallback?.({ type: response.errorType });
            else client.callback(response);
          });
        },
      };
      return client;
    },
    revoke,
  };
  return { oauth2, requests, revoke };
}

describe('createTokenManager', () => {
  it('requests the modify scope once and caches the token', async () => {
    const gis = fakeGis(() => ({ access_token: 'a1', expires_in: 3600, scope: GMAIL_MODIFY_SCOPE }));
    const manager = createTokenManager('cid', { loadOauth2: () => Promise.resolve(gis.oauth2), now: () => 0 });
    const [first, second] = await Promise.all([manager.getToken(), manager.getToken()]);
    expect(first).toBe('a1');
    expect(second).toBe('a1');
    expect(await manager.getToken()).toBe('a1');
    expect(gis.requests).toEqual([{ prompt: '', scope: GMAIL_MODIFY_SCOPE }]);
  });

  it('silently refreshes an expired token', async () => {
    let now = 0;
    let n = 0;
    const gis = fakeGis(() => ({ access_token: `t${(n += 1)}`, expires_in: '3600', scope: GMAIL_MODIFY_SCOPE }));
    const manager = createTokenManager('cid', { loadOauth2: () => Promise.resolve(gis.oauth2), now: () => now });
    expect(await manager.getToken()).toBe('t1');
    now = 3_600_000;
    expect(await manager.getToken()).toBe('t2');
    manager.invalidate();
    expect(await manager.getToken()).toBe('t3');
  });

  it('asks only for missing scopes, keeping granted ones', async () => {
    const gis = fakeGis((o) => ({ access_token: 'x', expires_in: 3600, scope: o?.scope ?? '' }));
    const manager = createTokenManager('cid', { loadOauth2: () => Promise.resolve(gis.oauth2), now: () => 0 });
    await manager.getToken();
    await manager.ensureScopes([GMAIL_COMPOSE_SCOPE]);
    expect(manager.hasScopes([GMAIL_MODIFY_SCOPE, GMAIL_COMPOSE_SCOPE])).toBe(true);
    await manager.ensureScopes([GMAIL_COMPOSE_SCOPE]);
    expect(gis.requests).toHaveLength(2);
    expect(gis.requests[1]?.scope).toContain(GMAIL_COMPOSE_SCOPE);
  });

  it('rejects when a scope is declined, the popup is closed or Google errors', async () => {
    const declined = fakeGis(() => ({ access_token: 'x', expires_in: 3600, scope: GMAIL_MODIFY_SCOPE }));
    const m1 = createTokenManager('cid', { loadOauth2: () => Promise.resolve(declined.oauth2) });
    await expect(m1.ensureScopes([GMAIL_COMPOSE_SCOPE])).rejects.toBeInstanceOf(AuthError);

    const closed = fakeGis(() => ({ errorType: 'popup_closed' }));
    const m2 = createTokenManager('cid', { loadOauth2: () => Promise.resolve(closed.oauth2) });
    await expect(m2.getToken()).rejects.toThrow('popup_closed');

    const denied = fakeGis(() => ({ error: 'access_denied' }));
    const m3 = createTokenManager('cid', { loadOauth2: () => Promise.resolve(denied.oauth2) });
    await expect(m3.getToken()).rejects.toThrow('access_denied');
  });

  it('revokes the token and forgets scopes', async () => {
    const gis = fakeGis(() => ({ access_token: 'x', expires_in: 3600, scope: GMAIL_MODIFY_SCOPE }));
    const manager = createTokenManager('cid', { loadOauth2: () => Promise.resolve(gis.oauth2) });
    await manager.getToken();
    manager.revoke();
    expect(gis.revoke).toHaveBeenCalledWith('x');
    expect(manager.hasScopes([GMAIL_MODIFY_SCOPE])).toBe(false);
  });
});

describe('loadGisOauth2', () => {
  afterEach(() => {
    delete (window as { google?: unknown }).google;
    document.head.innerHTML = '';
  });

  it('reuses an already loaded library', async () => {
    const oauth2 = { initTokenClient: vi.fn(), revoke: vi.fn() };
    (window as { google?: unknown }).google = { accounts: { oauth2 } };
    await expect(loadGisOauth2()).resolves.toBe(oauth2);
  });

  it('injects the script with the CSP nonce', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'csp-nonce');
    meta.nonce = 'abc';
    document.head.appendChild(meta);
    const promise = loadGisOauth2();
    const script = document.head.querySelector('script');
    expect(script?.src).toBe('https://accounts.google.com/gsi/client');
    expect(script?.nonce).toBe('abc');
    const oauth2 = { initTokenClient: vi.fn(), revoke: vi.fn() };
    (window as { google?: unknown }).google = { accounts: { oauth2 } };
    script?.onload?.(new Event('load'));
    await expect(promise).resolves.toBe(oauth2);
  });

  it('fails cleanly when the script cannot load', async () => {
    const promise = loadGisOauth2();
    document.head.querySelector('script')?.onerror?.(new Event('error'));
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    const second = loadGisOauth2();
    document.head.querySelectorAll('script')[1]?.onload?.(new Event('load'));
    await expect(second).rejects.toBeInstanceOf(AuthError);
  });
});
