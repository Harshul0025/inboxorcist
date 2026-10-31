import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '../../../shared/types';
import type * as FirebaseAppModule from '../../../src/lib/firebaseApp';

const sdk = vi.hoisted(() => ({
  initializeApp: vi.fn((options: unknown) => ({ options })),
  initializeAppCheck: vi.fn((_app: unknown, _options: unknown) => ({ appCheck: true })),
  getToken: vi.fn(() => Promise.resolve({ token: 'app-check-token' })),
  providers: [] as string[],
}));

vi.mock('firebase/app', () => ({ initializeApp: sdk.initializeApp }));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: sdk.initializeAppCheck,
  getToken: sdk.getToken,
  // A constructor function stands in for the SDK's provider class.
  ReCaptchaEnterpriseProvider: vi.fn(function ReCaptchaEnterpriseProvider(siteKey: string) {
    sdk.providers.push(siteKey);
  }),
}));

const firebase = { apiKey: 'k', authDomain: 'd', databaseURL: 'u', projectId: 'p', appId: 'a' };
const config = (overrides: Partial<PublicConfig> = {}): PublicConfig => ({
  googleClientId: null,
  firebase,
  recaptchaSiteKey: 'site-key',
  useEmulators: false,
  ...overrides,
});

type Module = typeof FirebaseAppModule;
let mod: Module;

beforeEach(async () => {
  vi.clearAllMocks();
  sdk.providers = [];
  sdk.getToken.mockImplementation(() => Promise.resolve({ token: 'app-check-token' }));
  sdk.initializeAppCheck.mockImplementation(() => ({ appCheck: true }));
  // The module caches the app, so each test starts from a fresh copy.
  vi.resetModules();
  mod = await import('../../../src/lib/firebaseApp');
});

describe('getFirebaseApp', () => {
  it('rejects without Firebase config and initialises the app only once', async () => {
    await expect(mod.getFirebaseApp(config({ firebase: null }))).rejects.toThrow('not configured');
    const [a, b] = await Promise.all([mod.getFirebaseApp(config()), mod.getFirebaseApp(config())]);
    expect(a).toBe(b);
    expect(sdk.initializeApp).toHaveBeenCalledTimes(1);
    expect(sdk.initializeApp).toHaveBeenCalledWith(firebase);
  });
});

describe('createAppCheckTokenGetter', () => {
  it('is disabled without a site key, without Firebase, or on the emulators', () => {
    expect(mod.createAppCheckTokenGetter(config({ recaptchaSiteKey: null }))).toBeNull();
    expect(mod.createAppCheckTokenGetter(config({ firebase: null }))).toBeNull();
    expect(mod.createAppCheckTokenGetter(config({ useEmulators: true }))).toBeNull();
  });

  it('returns App Check tokens from reCAPTCHA Enterprise', async () => {
    const getToken = mod.createAppCheckTokenGetter(config());
    await expect(getToken?.()).resolves.toBe('app-check-token');
    expect(sdk.providers).toEqual(['site-key']);
    expect(sdk.initializeAppCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
  });

  it('degrades to no token when App Check fails', async () => {
    sdk.getToken.mockImplementationOnce(() => Promise.reject(new Error('throttled')));
    const getToken = mod.createAppCheckTokenGetter(config());
    await expect(getToken?.()).resolves.toBeNull();
  });

  it('degrades to no token when App Check cannot start', async () => {
    sdk.initializeAppCheck.mockImplementationOnce(() => {
      throw new Error('bad site key');
    });
    const getToken = mod.createAppCheckTokenGetter(config());
    await expect(getToken?.()).resolves.toBeNull();
  });
});
