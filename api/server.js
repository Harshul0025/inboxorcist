// Vercel serverless entry point: the whole Express app runs as one function.
// Hashed assets are served by Vercel's CDN; everything else (HTML with a
// per-request CSP nonce, /api, /healthz) is rewritten here by vercel.json.
import path from 'node:path';
import { buildServer } from '../dist/server/server/bootstrap.js';
import { loadConfig } from '../dist/server/server/config.js';
import { createLogger } from '../dist/server/server/logger.js';

const config = loadConfig({ ...process.env, STATIC_DIR: path.join(process.cwd(), 'dist/html') });
const app = await buildServer(config, createLogger());

export default app;
