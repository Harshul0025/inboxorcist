import type { Express } from 'express';
import { createApp } from './app.js';
import type { ServerConfig } from './config.js';
import { createGeminiClient } from './llm.js';
import type { Logger } from './logger.js';
import { type AppCheckVerifier, createFirebaseAppCheckVerifier } from './middleware/appCheck.js';
import { createGameMaster } from './services/gameMaster.js';
import { createOneClickPoster } from './services/unsubscribe.js';

/**
 * Wires real dependencies (Gemini, App Check, unsubscribe) into the Express
 * app. Shared by the long-running server (Cloud Run, local) and the Vercel
 * serverless function.
 * @param config Server configuration.
 * @param logger Structured logger.
 */
export async function buildServer(config: ServerConfig, logger: Logger): Promise<Express> {
  let appCheckVerifier: AppCheckVerifier | null = null;
  if (config.enforceAppCheck) {
    if (!config.firebaseProjectId) throw new Error('ENFORCE_APP_CHECK is on but FIREBASE_PROJECT_ID is missing');
    appCheckVerifier = await createFirebaseAppCheckVerifier(config.firebaseProjectId);
  }

  const llm = config.geminiApiKey
    ? createGeminiClient(config.geminiApiKey, config.geminiModel, config.geminiThinkingLevel)
    : null;
  if (!llm) logger.log('WARNING', 'GEMINI_API_KEY not set: using the rule-based fallback game master');

  return createApp({
    config,
    logger,
    gameMaster: createGameMaster(llm, logger, config.geminiTimeoutMs),
    unsubscribe: createOneClickPoster(),
    appCheckVerifier,
  });
}
