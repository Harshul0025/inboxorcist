import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { nonceFor } from './middleware/security.js';

const ONE_YEAR_MS = 31_536_000_000;

/**
 * Injects the per-request CSP nonce into every script and style tag of the
 * built index.html, and exposes it to Vite's runtime via a meta tag.
 * @param html Built index.html.
 * @param nonce Base64 nonce for this response.
 */
export function injectNonce(html: string, nonce: string): string {
  return html
    .replace(/<script\b/g, `<script nonce="${nonce}"`)
    .replace(/<link rel="stylesheet"/g, `<link rel="stylesheet" nonce="${nonce}"`)
    .replace('</head>', `<meta property="csp-nonce" nonce="${nonce}" /></head>`);
}

/**
 * Serves the built client: hashed assets as immutable, other files for an
 * hour, and index.html (with a fresh CSP nonce) for every other GET route.
 * Does nothing when no build exists (API-only tests and local API dev).
 * @param app Express app.
 * @param staticDir Directory containing the built index.html.
 */
export function serveClient(app: Express, staticDir: string): void {
  const indexPath = path.join(staticDir, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  app.use(
    '/assets',
    express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: ONE_YEAR_MS, index: false }),
  );
  app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    res
      .status(200)
      // no-cache (not no-store) keeps back/forward-cache restores working; each fetch still revalidates.
      .set('cache-control', 'no-cache')
      .type('html')
      .send(injectNonce(indexHtml, nonceFor(res)));
  });
}
