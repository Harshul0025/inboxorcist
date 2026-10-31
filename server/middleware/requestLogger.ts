import type { RequestHandler } from 'express';
import type { Logger } from '../logger.js';

/**
 * Logs one structured line per request (method, path, status, latency).
 * Never logs bodies, query strings or headers.
 * @param logger Structured logger.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
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
  };
}
