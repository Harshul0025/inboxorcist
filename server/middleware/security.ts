import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';

/** Paths of Google and Firebase origins the browser legitimately talks to. */
const GOOGLE_CONNECT = [
  'https://gmail.googleapis.com',
  'https://www.googleapis.com',
  'https://oauth2.googleapis.com',
  'https://accounts.google.com',
  'https://*.firebaseio.com',
  'wss://*.firebaseio.com',
  'https://*.firebasedatabase.app',
  'wss://*.firebasedatabase.app',
  'https://firebaseappcheck.googleapis.com',
  'https://content-firebaseappcheck.googleapis.com',
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://www.google.com',
];
const EMULATOR_CONNECT = ['http://127.0.0.1:9000', 'ws://127.0.0.1:9000', 'http://127.0.0.1:9099'];

const nonces = new WeakMap<object, string>();

/**
 * Generates a fresh CSP nonce for every request.
 */
export function cspNonce(): RequestHandler {
  return (_req, res, next) => {
    nonces.set(res, randomBytes(16).toString('base64'));
    next();
  };
}

/**
 * The CSP nonce generated for a response by `cspNonce()`.
 * @param res The response object.
 */
export function nonceFor(res: object): string {
  return nonces.get(res) ?? '';
}

function nonceDirective(_req: IncomingMessage, res: ServerResponse): string {
  return `'nonce-${nonceFor(res)}'`;
}

/**
 * Helmet configuration with a strict, nonce-based Content Security Policy.
 * @param options.useEmulators Allow local Firebase emulator origins.
 * @param options.upgradeInsecure Add `upgrade-insecure-requests` (production only).
 */
export function securityHeaders(options: { useEmulators: boolean; upgradeInsecure: boolean }): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", nonceDirective, "'strict-dynamic'", 'https://accounts.google.com/gsi/client'],
        'style-src': ["'self'", nonceDirective, 'https://accounts.google.com/gsi/style'],
        // No inline style attributes: React and Motion style elements through the CSSOM, which CSP allows.
        'style-src-attr': ["'none'"],
        'img-src': ["'self'", 'data:', 'https://*.googleusercontent.com', 'https://www.gstatic.com'],
        'font-src': ["'self'"],
        'connect-src': ["'self'", ...GOOGLE_CONNECT, ...(options.useEmulators ? EMULATOR_CONNECT : [])],
        'frame-src': [
          'https://accounts.google.com',
          'https://www.google.com',
          'https://recaptcha.google.com',
          'https://*.firebaseio.com',
        ],
        'worker-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        ...(options.upgradeInsecure ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    // Google sign-in uses a popup that must talk back to this window.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xFrameOptions: { action: 'deny' },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
  });
}

/** Browser features the game never needs are switched off for this origin and any frames. */
export const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'bluetooth=()',
  'browsing-topics=()',
  'clipboard-write=(self)',
].join(', ');

/** Sends the Permissions-Policy header (Helmet does not set it). */
export function permissionsPolicy(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  };
}

/**
 * Blocks state-changing API requests coming from another origin (CSRF
 * defence). No CORS headers are ever sent, so other origins cannot read
 * responses either.
 * @param allowedOrigins Extra origins to accept (e.g. the Vite dev server).
 */
export function sameOriginOnly(allowedOrigins: readonly string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    const origin = req.get('origin');
    if (!origin) {
      next();
      return;
    }
    const self = `${req.protocol}://${req.get('host') ?? ''}`;
    if (origin === self || allowedOrigins.includes(origin)) {
      next();
      return;
    }
    res.status(403).json({ error: 'forbidden_origin' });
  };
}
