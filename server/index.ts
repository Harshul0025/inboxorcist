import { buildServer } from './bootstrap.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger();
const app = await buildServer(config, logger);

const server = app.listen(config.port, () => {
  logger.log('INFO', 'inboxorcist listening', {
    port: config.port,
    gemini: Boolean(config.geminiApiKey),
    model: config.geminiModel,
    appCheck: config.enforceAppCheck,
  });
});

function shutdown(signal: string): void {
  logger.log('INFO', 'shutting down', { signal });
  server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
