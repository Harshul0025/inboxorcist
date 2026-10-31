import { describe, expect, it, vi } from 'vitest';
import { cacheKey, TtlCache } from '../../server/cache';
import { loadConfig, toPublicConfig } from '../../server/config';
import { createLogger, redact } from '../../server/logger';

describe('TtlCache', () => {
  it('expires entries and evicts the least recently used', () => {
    let now = 0;
    const cache = new TtlCache<number>(2, 100, () => now);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(2);
    now = 200;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('builds stable keys', () => {
    expect(cacheKey({ a: 1 })).toBe(cacheKey({ a: 1 }));
    expect(cacheKey({ a: 1 })).not.toBe(cacheKey({ a: 2 }));
  });
});

describe('logger', () => {
  it('writes Cloud Logging JSON and redacts personal fields', () => {
    const write = vi.fn();
    createLogger(write).log('INFO', 'hello', {
      path: '/api/propose',
      senderEmail: 'a@b.co',
      subject: 'x',
      status: 200,
    });
    const entry = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(entry).toMatchObject({ severity: 'INFO', message: 'hello', path: '/api/propose', status: 200 });
    expect(entry.senderEmail).toBe('[redacted]');
    expect(entry.subject).toBe('[redacted]');
    expect(redact()).toEqual({});
  });
});

describe('config', () => {
  it('reads defaults and env values', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      port: 8080,
      geminiApiKey: null,
      geminiModel: 'gemini-3.5-flash-lite',
      geminiThinkingLevel: 'MINIMAL',
      geminiTimeoutMs: 30_000,
      firebase: null,
    });
    const full = loadConfig({
      PORT: '9000',
      NODE_ENV: 'production',
      GEMINI_API_KEY: ' key ',
      GOOGLE_CLIENT_ID: 'cid',
      FIREBASE_API_KEY: 'k',
      FIREBASE_AUTH_DOMAIN: 'd',
      FIREBASE_DATABASE_URL: 'u',
      FIREBASE_PROJECT_ID: 'p',
      FIREBASE_APP_ID: 'a',
      RECAPTCHA_SITE_KEY: 'r',
      ENFORCE_APP_CHECK: 'true',
      ALLOWED_ORIGINS: 'http://a, http://b',
      GEMINI_THINKING_LEVEL: 'default',
      GEMINI_TIMEOUT_MS: '5000',
    });
    expect(full.geminiThinkingLevel).toBeNull();
    expect(full.geminiTimeoutMs).toBe(5000);
    expect(loadConfig({ GEMINI_THINKING_LEVEL: 'low', GEMINI_TIMEOUT_MS: '-1' })).toMatchObject({
      geminiThinkingLevel: 'LOW',
      geminiTimeoutMs: 30_000,
    });
    expect(full).toMatchObject({ port: 9000, isProduction: true, geminiApiKey: 'key', enforceAppCheck: true });
    expect(full.allowedOrigins).toEqual(['http://a', 'http://b']);
    expect(toPublicConfig(full)).toEqual({
      googleClientId: 'cid',
      firebase: { apiKey: 'k', authDomain: 'd', databaseURL: 'u', projectId: 'p', appId: 'a' },
      recaptchaSiteKey: 'r',
      useEmulators: false,
    });
    expect(JSON.stringify(toPublicConfig(full))).not.toContain('key"');
  });
});
