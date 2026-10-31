import type { FirebaseApp } from 'firebase/app';
import type { AppCheck } from 'firebase/app-check';
import type { PublicConfig } from '../../shared/types';

let appPromise: Promise<FirebaseApp> | null = null;
let appCheckPromise: Promise<AppCheck | null> | null = null;

/**
 * Lazily initialises the Firebase app. The SDK is only downloaded when a
 * feature needs it (App Check or Raid Mode).
 * @param config Public runtime config with Firebase settings.
 */
export function getFirebaseApp(config: PublicConfig): Promise<FirebaseApp> {
  const firebase = config.firebase;
  if (!firebase) return Promise.reject(new Error('Firebase is not configured'));
  appPromise ??= import('firebase/app').then(({ initializeApp }) => initializeApp(firebase));
  return appPromise;
}

/**
 * Starts Firebase App Check with reCAPTCHA Enterprise when configured.
 * @param config Public runtime config.
 * @returns A token getter for API calls, or null when App Check is off.
 */
export function createAppCheckTokenGetter(config: PublicConfig): (() => Promise<string | null>) | null {
  const siteKey = config.recaptchaSiteKey;
  if (!config.firebase || !siteKey || config.useEmulators) return null;

  appCheckPromise ??= (async () => {
    const app = await getFirebaseApp(config);
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    return initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  })().catch(() => null);

  return async () => {
    const appCheck = await appCheckPromise;
    if (!appCheck) return null;
    try {
      const { getToken } = await import('firebase/app-check');
      return (await getToken(appCheck, false)).token;
    } catch {
      return null;
    }
  };
}
