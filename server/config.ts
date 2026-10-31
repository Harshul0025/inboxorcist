import path from 'node:path';
import { GEMINI_TIMEOUT_MS } from '../shared/constants.js';
import { fileURLToPath } from 'node:url';
import type { FirebaseWebConfig, PublicConfig } from '../shared/types.js';

export interface ServerConfig {
  port: number;
  isProduction: boolean;
  geminiApiKey: string | null;
  geminiModel: string;
  /** Gemini 3 thinking level (e.g. MINIMAL, LOW); null leaves the model default. */
  geminiThinkingLevel: string | null;
  geminiTimeoutMs: number;
  googleClientId: string | null;
  firebase: FirebaseWebConfig | null;
  firebaseProjectId: string | null;
  recaptchaSiteKey: string | null;
  enforceAppCheck: boolean;
  useEmulators: boolean;
  allowedOrigins: string[];
  staticDir: string;
}

type Env = Record<string, string | undefined>;

const DEFAULT_PORT = 8080;
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_THINKING_LEVEL = 'MINIMAL';

function readString(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  if (!value) return null;
  return value;
}

function readPositiveInt(env: Env, key: string): number | null {
  const value = Number.parseInt(env[key] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readThinkingLevel(env: Env): string | null {
  const value = readString(env, 'GEMINI_THINKING_LEVEL') ?? DEFAULT_THINKING_LEVEL;
  return value.toUpperCase() === 'DEFAULT' ? null : value.toUpperCase();
}

function readFirebase(env: Env): FirebaseWebConfig | null {
  const apiKey = readString(env, 'FIREBASE_API_KEY');
  const authDomain = readString(env, 'FIREBASE_AUTH_DOMAIN');
  const databaseURL = readString(env, 'FIREBASE_DATABASE_URL');
  const projectId = readString(env, 'FIREBASE_PROJECT_ID');
  const appId = readString(env, 'FIREBASE_APP_ID');
  if (!apiKey || !authDomain || !databaseURL || !projectId || !appId) return null;
  return { apiKey, authDomain, databaseURL, projectId, appId };
}

/**
 * Reads server configuration from environment variables. Secrets (the Gemini
 * key) are only ever read here and never sent to the browser.
 * @param env Environment variables, defaults to `process.env`.
 */
export function loadConfig(env: Env = process.env): ServerConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const parsedPort = Number.parseInt(env.PORT ?? '', 10);
  return {
    port: Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT,
    isProduction: env.NODE_ENV === 'production',
    geminiApiKey: readString(env, 'GEMINI_API_KEY'),
    geminiModel: readString(env, 'GEMINI_MODEL') ?? DEFAULT_MODEL,
    geminiThinkingLevel: readThinkingLevel(env),
    geminiTimeoutMs: readPositiveInt(env, 'GEMINI_TIMEOUT_MS') ?? GEMINI_TIMEOUT_MS,
    googleClientId: readString(env, 'GOOGLE_CLIENT_ID'),
    firebase: readFirebase(env),
    firebaseProjectId: readString(env, 'FIREBASE_PROJECT_ID'),
    recaptchaSiteKey: readString(env, 'RECAPTCHA_SITE_KEY'),
    enforceAppCheck: env.ENFORCE_APP_CHECK === 'true',
    useEmulators: env.USE_FIREBASE_EMULATORS === 'true',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    staticDir: readString(env, 'STATIC_DIR') ?? path.resolve(here, '../../client'),
  };
}

/**
 * Picks the subset of configuration that is safe to expose publicly.
 * @param config Full server configuration.
 */
export function toPublicConfig(config: ServerConfig): PublicConfig {
  return {
    googleClientId: config.googleClientId,
    firebase: config.firebase,
    recaptchaSiteKey: config.recaptchaSiteKey,
    useEmulators: config.useEmulators,
  };
}
