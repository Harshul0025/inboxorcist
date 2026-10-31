import type { RequestHandler } from 'express';
import type { Logger } from '../logger.js';

/** Verifies a Firebase App Check token; resolves when valid, rejects otherwise. */
export type AppCheckVerifier = (token: string) => Promise<void>;

export const APP_CHECK_HEADER = 'x-firebase-appcheck';

/**
 * Requires a valid Firebase App Check token on API requests when enforcement
 * is on. With enforcement off (local dev, tests) requests pass through.
 * @param verifier Token verifier, or null when App Check is not configured.
 * @param enforce Whether to reject requests without a valid token.
 * @param logger Structured logger.
 */
export function requireAppCheck(verifier: AppCheckVerifier | null, enforce: boolean, logger: Logger): RequestHandler {
  return (req, res, next) => {
    if (!enforce) {
      next();
      return;
    }
    const token = req.get(APP_CHECK_HEADER);
    if (!token || !verifier) {
      res.status(401).json({ error: 'app_check_required' });
      return;
    }
    verifier(token).then(
      () => next(),
      () => {
        logger.log('WARNING', 'app check token rejected', { path: req.path });
        res.status(401).json({ error: 'app_check_invalid' });
      },
    );
  };
}

/**
 * Creates a verifier backed by the Firebase Admin SDK. Imported lazily so the
 * Admin SDK only loads when App Check is enforced.
 * @param projectId Firebase project id.
 */
export async function createFirebaseAppCheckVerifier(projectId: string): Promise<AppCheckVerifier> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getAppCheck } = await import('firebase-admin/app-check');
  const app = getApps()[0] ?? initializeApp({ projectId });
  const appCheck = getAppCheck(app);
  return async (token) => {
    await appCheck.verifyToken(token);
  };
}
