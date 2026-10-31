import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorName, errorProperty } from '../../server/errors';
import type { Logger } from '../../server/logger';
import { testConfig } from './helpers';

const verifier = vi.hoisted(() =>
  vi.fn((token: string) => (token === 'good' ? Promise.resolve() : Promise.reject(new Error('bad')))),
);
vi.mock('../../server/middleware/appCheck', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createFirebaseAppCheckVerifier: vi.fn(() => Promise.resolve(verifier)),
}));

const { buildServer } = await import('../../server/bootstrap');

function capture(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return { lines, log: (severity, message) => lines.push(`${severity} ${message}`) };
}

describe('buildServer', () => {
  it('falls back to the rulebook (and says so) without a Gemini key', async () => {
    const logger = capture();
    const app = await buildServer(testConfig({ geminiApiKey: null }), logger);
    expect((await request(app).get('/healthz')).status).toBe(200);
    expect(logger.lines.some((line) => line.includes('GEMINI_API_KEY not set'))).toBe(true);
  });

  it('wires Gemini when a key is configured', async () => {
    const logger = capture();
    const app = await buildServer(testConfig({ geminiApiKey: 'key' }), logger);
    expect((await request(app).get('/api/config')).status).toBe(200);
    expect(logger.lines.some((line) => line.includes('GEMINI_API_KEY not set'))).toBe(false);
  });

  it('refuses to start App Check enforcement without a project id', async () => {
    await expect(
      buildServer(testConfig({ enforceAppCheck: true, firebaseProjectId: null }), capture()),
    ).rejects.toThrow('FIREBASE_PROJECT_ID');
  });

  it('enforces App Check with the Admin SDK verifier', async () => {
    const app = await buildServer(testConfig({ enforceAppCheck: true, firebaseProjectId: 'p' }), capture());
    const body = { senderName: 'A', subject: 'B', snippet: '' };
    expect((await request(app).post('/api/draft').send(body)).status).toBe(401);
    expect((await request(app).post('/api/draft').set('X-Firebase-AppCheck', 'good').send(body)).status).toBe(200);
  });
});

describe('error helpers', () => {
  it('read string properties from unknown thrown values', () => {
    expect(errorProperty(Object.assign(new Error('x'), { code: 'EUNSAFE' }), 'code')).toBe('EUNSAFE');
    expect(errorProperty({ type: 'entity.too.large' }, 'type')).toBe('entity.too.large');
    expect(errorProperty({ code: 42 }, 'code')).toBeUndefined();
    expect(errorProperty('boom', 'code')).toBeUndefined();
    expect(errorProperty(null, 'type')).toBeUndefined();
  });

  it('name errors without leaking messages', () => {
    expect(errorName(new TypeError('secret'))).toBe('TypeError');
    expect(errorName('secret')).toBe('unknown');
  });
});
