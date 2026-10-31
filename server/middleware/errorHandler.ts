import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { errorName, errorProperty } from '../errors.js';
import type { Logger } from '../logger.js';

/**
 * Maps errors to safe JSON responses: validation and body-parsing problems
 * become 4xx, anything else a generic 500 with no internal details.
 * @param logger Structured logger.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'invalid_request', issues: error.issues.length });
      return;
    }
    const type = errorProperty(error, 'type');
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large' });
      return;
    }
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    logger.log('ERROR', 'unhandled error', { path: req.path, errorType: errorName(error) });
    res.status(500).json({ error: 'internal' });
  };
}
