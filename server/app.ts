import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import {
  API_RATE_LIMIT_PER_MIN,
  BODY_LIMIT,
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  UNSUBSCRIBE_RATE_LIMIT_PER_MIN,
} from '../shared/constants.js';
import {
  draftRequestSchema,
  proposeRequestSchema,
  roastRequestSchema,
  unsubscribeRequestSchema,
} from '../shared/schemas.js';
import type { Proposal } from '../shared/types.js';
import { cacheKey, TtlCache } from './cache.js';
import { type ServerConfig, toPublicConfig } from './config.js';
import type { Logger } from './logger.js';
import { type AppCheckVerifier, requireAppCheck } from './middleware/appCheck.js';
import { cspNonce, sameOriginOnly, securityHeaders } from './middleware/security.js';
import type { GameMaster } from './services/gameMaster.js';
import { type OneClickPoster, UnsafeUrlError } from './services/unsubscribe.js';

export interface AppDeps {
  config: ServerConfig;
  logger: Logger;
  gameMaster: GameMaster;
  unsubscribe: OneClickPoster;
  appCheckVerifier: AppCheckVerifier | null;
}

const ONE_MINUTE_MS = 60_000;
const ONE_YEAR_S = 31_536_000;

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

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
 * Builds the Express application. All dependencies are injected so the app
 * can be tested without network access or secrets.
 */
export function createApp(deps: AppDeps): express.Express {
  const { config, logger, gameMaster } = deps;
  const app = express();
  const proposalCache = new TtlCache<Proposal>(CACHE_MAX_ENTRIES, CACHE_TTL_MS);

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(compression());
  app.use(cspNonce());
  app.use(securityHeaders({ useEmulators: config.useEmulators, upgradeInsecure: config.isProduction }));

  app.use((req, res, next) => {
    const started = Date.now();
    // Captured up front: routers rewrite req.url while the request is handled.
    const path = req.path;
    res.on('finish', () => {
      logger.log(res.statusCode >= 500 ? 'ERROR' : 'INFO', 'request', {
        method: req.method,
        path,
        status: res.statusCode,
        latencyMs: Date.now() - started,
      });
    });
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.set('cache-control', 'no-store').json({ status: 'ok' });
  });

  const api = express.Router();
  api.use(express.json({ limit: BODY_LIMIT }));
  api.use(
    rateLimit({
      windowMs: ONE_MINUTE_MS,
      limit: API_RATE_LIMIT_PER_MIN,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  api.use(sameOriginOnly(config.allowedOrigins));
  api.use((_req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
  });

  api.get('/config', (_req, res) => {
    res.json(toPublicConfig(config));
  });

  api.use(requireAppCheck(deps.appCheckVerifier, config.enforceAppCheck, logger));

  api.post(
    '/propose',
    asyncRoute(async (req, res) => {
      const { groups } = proposeRequestSchema.parse(req.body);
      const key = cacheKey(groups);
      const cached = proposalCache.get(key);
      if (cached) {
        res.json(cached);
        return;
      }
      const proposal = await gameMaster.propose(groups);
      if (proposal.source === 'gemini') proposalCache.set(key, proposal);
      res.json(proposal);
    }),
  );

  api.post(
    '/roast',
    asyncRoute(async (req, res) => {
      const { stats, categories } = roastRequestSchema.parse(req.body);
      res.json(await gameMaster.roast(stats, categories));
    }),
  );

  api.post(
    '/draft',
    asyncRoute(async (req, res) => {
      res.json(await gameMaster.draft(draftRequestSchema.parse(req.body)));
    }),
  );

  api.post(
    '/unsubscribe',
    rateLimit({
      windowMs: ONE_MINUTE_MS,
      limit: UNSUBSCRIBE_RATE_LIMIT_PER_MIN,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    asyncRoute(async (req, res) => {
      const { url } = unsubscribeRequestSchema.parse(req.body);
      try {
        const status = await deps.unsubscribe(url);
        res.json({ ok: status >= 200 && status < 300, status });
      } catch (error) {
        if (error instanceof UnsafeUrlError || (error as { code?: string }).code === 'EUNSAFE') {
          res.status(400).json({ error: 'unsafe_url' });
          return;
        }
        res.status(502).json({ error: 'unsubscribe_failed' });
      }
    }),
  );

  api.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use('/api', api);

  const indexPath = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    app.use(
      '/assets',
      express.static(path.join(config.staticDir, 'assets'), {
        immutable: true,
        maxAge: ONE_YEAR_S * 1000,
        index: false,
      }),
    );
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
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
        .send(injectNonce(indexHtml, String(res.locals.cspNonce)));
    });
  }

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'invalid_request', issues: error.issues.length });
      return;
    }
    if ((error as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large' });
      return;
    }
    if ((error as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    logger.log('ERROR', 'unhandled error', {
      path: req.path,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    res.status(500).json({ error: 'internal' });
  });

  return app;
}
