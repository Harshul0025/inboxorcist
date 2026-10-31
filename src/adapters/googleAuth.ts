export const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
export const GMAIL_SETTINGS_SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';
export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const EXPIRY_MARGIN_MS = 60_000;

/** Subset of the Google Identity Services token response we use. */
export interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
}

export interface TokenClient {
  callback: (response: TokenResponse) => void;
  requestAccessToken(overrides?: { prompt?: string; scope?: string }): void;
}

export interface GisOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}

/** Thrown when the user closes the consent popup or denies a scope. */
export class AuthError extends Error {
  override name = 'AuthError';
}

export interface TokenManager {
  /** Returns a valid access token, silently refreshing it when it expired. */
  getToken(): Promise<string>;
  /** Makes sure the given scopes are granted, asking only for the missing ones. */
  ensureScopes(scopes: readonly string[]): Promise<void>;
  /** True when every scope is already granted. */
  hasScopes(scopes: readonly string[]): boolean;
  /** Forgets the current token, e.g. after a 401. */
  invalidate(): void;
  /** Revokes the token with Google and forgets it. */
  revoke(): void;
}

interface Window {
  google?: { accounts?: { oauth2?: GisOauth2 } };
}

/**
 * Loads the Google Identity Services script (with the page's CSP nonce) and
 * resolves its OAuth 2 API.
 */
export function loadGisOauth2(): Promise<GisOauth2> {
  const win = window as unknown as Window;
  const existing = win.google?.accounts?.oauth2;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    const nonce = document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce;
    if (nonce) script.nonce = nonce;
    script.onload = () => {
      const oauth2 = win.google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new AuthError('Google sign-in failed to load'));
    };
    script.onerror = () => reject(new AuthError('Google sign-in failed to load'));
    document.head.appendChild(script);
  });
}

/**
 * Manages Gmail access tokens with incremental authorization: the base scope
 * is requested on connect, extra scopes only when a feature needs them.
 * The token lives in memory only and is never sent to our server.
 * @param clientId OAuth 2.0 web client id.
 * @param deps Injectable GIS loader and clock (for tests).
 */
export function createTokenManager(
  clientId: string,
  deps: { loadOauth2?: () => Promise<GisOauth2>; now?: () => number } = {},
): TokenManager {
  const loadOauth2 = deps.loadOauth2 ?? loadGisOauth2;
  const now = deps.now ?? Date.now;
  const granted = new Set<string>();
  let token: string | null = null;
  let expiresAt = 0;
  let client: TokenClient | null = null;
  let oauth2: GisOauth2 | null = null;
  let pending: { resolve: () => void; reject: (error: Error) => void } | null = null;
  let inflight: Promise<void> | null = null;

  function handleResponse(response: TokenResponse): void {
    const current = pending;
    pending = null;
    if (!current) return;
    if (response.error || !response.access_token) {
      current.reject(new AuthError(response.error ?? 'No access token returned'));
      return;
    }
    token = response.access_token;
    expiresAt = now() + Number(response.expires_in ?? 3600) * 1000;
    for (const scope of (response.scope ?? '').split(' ')) if (scope) granted.add(scope);
    current.resolve();
  }

  async function request(scopes: readonly string[], prompt: string): Promise<void> {
    if (!client) {
      oauth2 = await loadOauth2();
      client = oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_MODIFY_SCOPE,
        include_granted_scopes: true,
        callback: handleResponse,
        error_callback: (error) => {
          const current = pending;
          pending = null;
          current?.reject(new AuthError(error.type ?? 'popup_closed'));
        },
      });
    }
    const tokenClient = client;
    await new Promise<void>((resolve, reject) => {
      pending = { resolve, reject };
      tokenClient.requestAccessToken({ prompt, scope: scopes.join(' ') });
    });
  }

  function single(task: () => Promise<void>): Promise<void> {
    inflight ??= task().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  const manager: TokenManager = {
    async getToken() {
      if (!token || now() >= expiresAt - EXPIRY_MARGIN_MS) {
        const scopes = granted.size > 0 ? [...granted] : [GMAIL_MODIFY_SCOPE];
        await single(() => request(scopes, ''));
      }
      if (!token) throw new AuthError('Not signed in');
      return token;
    },
    async ensureScopes(scopes) {
      if (token && manager.hasScopes(scopes) && now() < expiresAt - EXPIRY_MARGIN_MS) return;
      await single(() => request([...new Set([...granted, GMAIL_MODIFY_SCOPE, ...scopes])], ''));
      if (!manager.hasScopes(scopes)) throw new AuthError('Permission was not granted');
    },
    hasScopes(scopes) {
      return scopes.every((scope) => granted.has(scope));
    },
    invalidate() {
      token = null;
      expiresAt = 0;
    },
    revoke() {
      if (token && oauth2) oauth2.revoke(token);
      token = null;
      expiresAt = 0;
      granted.clear();
    },
  };
  return manager;
}
