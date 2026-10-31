import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  API_RATE_LIMIT_PER_MIN,
  BODY_LIMIT,
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  UNSUBSCRIBE_RATE_LIMIT_PER_MIN,
} from '../../shared/constants.js';
import {
  draftRequestSchema,
  proposeRequestSchema,
  roastRequestSchema,
  unsubscribeRequestSchema,
} from '../../shared/schemas.js';
import type { Proposal } from '../../shared/types.js';
import { cacheKey, TtlCache } from '../cache.js';
import { type ServerConfig, toPublicConfig } from '../config.js';
import { errorProperty } from '../errors.js';
import type { Logger } from '../logger.js';
import { type AppCheckVerifier, requireAppCheck } from '../middleware/appCheck.js';
import { sameOriginOnly } from '../middleware/security.js';
import type { GameMaster } from '../services/gameMaster.js';
import { type OneClickPoster, UnsafeUrlError } from '../services/unsubscribe.js';

export interface ApiDeps {
  config: ServerConfig;
  logger: Logger;
  gameMaster: GameMaster;
  unsubscribe: OneClickPoster;
  appCheckVerifier: AppCheckVerifier | null;
}

const ONE_MINUTE_MS = 60_000;

function limiter(limit: number) {
  return rateLimit({ windowMs: ONE_MINUTE_MS, limit, standardHeaders: 'draft-8', legacyHeaders: false });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/**
 * The `/api` router: JSON parsing, rate limiting, same-origin and App Check
 * guards, then the game master and unsubscribe endpoints.
 * @param deps Injected configuration and services.
 */
export function createApiRouter(deps: ApiDeps): Router {
  const { config, logger, gameMaster } = deps;
  const proposalCache = new TtlCache<Proposal>(CACHE_MAX_ENTRIES, CACHE_TTL_MS);
  const api = express.Router();

  api.use(express.json({ limit: BODY_LIMIT }));
  api.use(limiter(API_RATE_LIMIT_PER_MIN));
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
      // Only cache real Gemini answers, so a temporary outage is not remembered.
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
    limiter(UNSUBSCRIBE_RATE_LIMIT_PER_MIN),
    asyncRoute(async (req, res) => {
      const { url } = unsubscribeRequestSchema.parse(req.body);
      try {
        const status = await deps.unsubscribe(url);
        res.json({ ok: status >= 200 && status < 300, status });
      } catch (error) {
        if (error instanceof UnsafeUrlError || errorProperty(error, 'code') === 'EUNSAFE') {
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

  return api;
}
