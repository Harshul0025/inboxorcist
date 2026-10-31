import compression from 'compression';
import express from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { cspNonce, permissionsPolicy, securityHeaders } from './middleware/security.js';
import { type ApiDeps, createApiRouter } from './routes/api.js';
import { serveClient } from './static.js';

export type AppDeps = ApiDeps;

/**
 * Builds the Express application. All dependencies are injected so the app
 * can be tested without network access or secrets.
 */
export function createApp(deps: AppDeps): express.Express {
  const { config, logger } = deps;
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(compression());
  app.use(cspNonce());
  app.use(securityHeaders({ useEmulators: config.useEmulators, upgradeInsecure: config.isProduction }));
  app.use(permissionsPolicy());
  app.use(requestLogger(logger));

  app.get('/healthz', (_req, res) => {
    res.set('cache-control', 'no-store').json({ status: 'ok' });
  });
  app.use('/api', createApiRouter(deps));
  serveClient(app, config.staticDir);
  app.use(errorHandler(logger));

  return app;
}
