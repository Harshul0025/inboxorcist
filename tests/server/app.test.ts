import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { injectNonce } from '../../server/static';
import { UnsafeUrlError } from '../../server/services/unsubscribe';
import { buildApp, fakeGameMaster, groups, stats, testConfig } from './helpers';

describe('health and config', () => {
  it('reports health without caching', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('exposes only public config', async () => {
    const { app } = buildApp({ config: testConfig({ geminiApiKey: 'secret-key', googleClientId: 'cid' }) });
    const res = await request(app).get('/api/config');
    expect(res.body).toEqual({ googleClientId: 'cid', firebase: null, recaptchaSiteKey: null, useEmulators: false });
    expect(JSON.stringify(res.body)).not.toContain('secret-key');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });
});

describe('security headers', () => {
  it('sends a strict CSP with a fresh nonce and hardening headers', async () => {
    const { app } = buildApp();
    const a = await request(app).get('/healthz');
    const b = await request(app).get('/healthz');
    const csp = String(a.headers['content-security-policy']);
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(a.headers['content-security-policy']).not.toBe(b.headers['content-security-policy']);
    expect(a.headers['x-frame-options']).toBe('DENY');
    expect(a.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    expect(a.headers['x-powered-by']).toBeUndefined();
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("style-src-attr 'none'");
    expect(a.headers['permissions-policy']).toContain('camera=()');
    expect(a.headers['permissions-policy']).toContain('clipboard-write=(self)');
  });

  it('upgrades insecure requests in production and allows emulators when asked', async () => {
    const prod = buildApp({ config: testConfig({ isProduction: true }) }).app;
    expect(String((await request(prod).get('/healthz')).headers['content-security-policy'])).toContain(
      'upgrade-insecure-requests',
    );
    const emu = buildApp({ config: testConfig({ useEmulators: true }) }).app;
    expect(String((await request(emu).get('/healthz')).headers['content-security-policy'])).toContain(
      'ws://127.0.0.1:9000',
    );
  });

  it('blocks cross-origin POSTs but allows same-origin and allow-listed origins', async () => {
    const { app } = buildApp({ config: testConfig({ allowedOrigins: ['http://localhost:5173'] }) });
    const body = { stats, categories: [] };
    expect((await request(app).post('/api/roast').set('origin', 'https://evil.example').send(body)).status).toBe(403);
    expect((await request(app).post('/api/roast').set('origin', 'http://localhost:5173').send(body)).status).toBe(200);
    const self = await request(app)
      .post('/api/roast')
      .set('host', 'game.example')
      .set('origin', 'http://game.example')
      .send(body);
    expect(self.status).toBe(200);
  });

  it('rate-limits the API', async () => {
    const { app } = buildApp();
    let last = 0;
    for (let i = 0; i < 61; i += 1) last = (await request(app).get('/api/config')).status;
    expect(last).toBe(429);
  });
});

describe('POST /api/propose', () => {
  it('validates input', async () => {
    const { app } = buildApp();
    expect((await request(app).post('/api/propose').send({ groups: [] })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/propose')
          .send({ groups: [{ sender: 'x' }] })
      ).status,
    ).toBe(400);
    const res = await request(app).post('/api/propose').set('content-type', 'application/json').send('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_json' });
  });

  it('rejects oversized bodies', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/propose')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(70_000) }));
    expect(res.status).toBe(413);
  });

  it('returns proposals and caches Gemini results', async () => {
    const gameMaster = fakeGameMaster();
    const { app } = buildApp({ gameMaster });
    const first = await request(app).post('/api/propose').send({ groups });
    const second = await request(app).post('/api/propose').send({ groups });
    expect(first.status).toBe(200);
    expect(first.body.verdicts[0].sender).toBe('offers@swiggy.in');
    expect(second.body).toEqual(first.body);
    expect(gameMaster.propose).toHaveBeenCalledTimes(1);
  });

  it('does not cache fallback results', async () => {
    const gameMaster = fakeGameMaster();
    gameMaster.propose.mockImplementation(() =>
      Promise.resolve({ verdicts: [], importantIds: [], source: 'fallback' }),
    );
    const { app } = buildApp({ gameMaster });
    await request(app).post('/api/propose').send({ groups });
    await request(app).post('/api/propose').send({ groups });
    expect(gameMaster.propose).toHaveBeenCalledTimes(2);
  });

  it('hides internal errors', async () => {
    const gameMaster = fakeGameMaster();
    gameMaster.propose.mockRejectedValue(new Error('secret stack'));
    const { app } = buildApp({ gameMaster });
    const res = await request(app).post('/api/propose').send({ groups });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal' });
  });
});

describe('roast and draft', () => {
  it('returns a roast and a draft', async () => {
    const { app } = buildApp();
    expect(
      (
        await request(app)
          .post('/api/roast')
          .send({ stats, categories: ['Food'] })
      ).body.lines,
    ).toHaveLength(2);
    const draft = await request(app).post('/api/draft').send({ senderName: 'Riya', subject: 'Hi', snippet: 'x' });
    expect(draft.body.body).toContain('Hi Riya');
  });
});

describe('POST /api/unsubscribe', () => {
  it('reports success and failure from the poster', async () => {
    const unsubscribe = vi.fn().mockResolvedValueOnce(200).mockResolvedValueOnce(500);
    const { app } = buildApp({ unsubscribe });
    expect((await request(app).post('/api/unsubscribe').send({ url: 'https://x.example/u' })).body).toEqual({
      ok: true,
      status: 200,
    });
    expect((await request(app).post('/api/unsubscribe').send({ url: 'https://x.example/u' })).body).toEqual({
      ok: false,
      status: 500,
    });
  });

  it('rejects non-https and unsafe URLs', async () => {
    const unsubscribe = vi
      .fn()
      .mockRejectedValueOnce(new UnsafeUrlError('private'))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'EUNSAFE' }))
      .mockRejectedValueOnce(new Error('timeout'));
    const { app } = buildApp({ unsubscribe });
    expect((await request(app).post('/api/unsubscribe').send({ url: 'http://x.example/u' })).status).toBe(400);
    expect((await request(app).post('/api/unsubscribe').send({ url: 'https://10.0.0.1/u' })).status).toBe(400);
    expect((await request(app).post('/api/unsubscribe').send({ url: 'https://rebind.example/u' })).status).toBe(400);
    expect((await request(app).post('/api/unsubscribe').send({ url: 'https://slow.example/u' })).status).toBe(502);
  });
});

describe('App Check enforcement', () => {
  it('requires a valid token when enforced, but never for /api/config', async () => {
    const verifier = vi.fn((token: string) =>
      token === 'good' ? Promise.resolve() : Promise.reject(new Error('bad')),
    );
    const { app } = buildApp({ config: testConfig({ enforceAppCheck: true }), appCheckVerifier: verifier });
    expect((await request(app).get('/api/config')).status).toBe(200);
    const body = { stats, categories: [] };
    expect((await request(app).post('/api/roast').send(body)).status).toBe(401);
    expect((await request(app).post('/api/roast').set('X-Firebase-AppCheck', 'bad').send(body)).status).toBe(401);
    expect((await request(app).post('/api/roast').set('X-Firebase-AppCheck', 'good').send(body)).status).toBe(200);
  });

  it('fails closed when enforced without a verifier', async () => {
    const { app } = buildApp({ config: testConfig({ enforceAppCheck: true }), appCheckVerifier: null });
    expect(
      (await request(app).post('/api/roast').set('X-Firebase-AppCheck', 'x').send({ stats, categories: [] })).status,
    ).toBe(401);
  });
});

describe('static client', () => {
  function withStaticDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inboxorcist-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      '<html><head><link rel="stylesheet" href="/assets/a.css"></head><body><script type="module" src="/assets/a.js"></script></body></html>',
    );
    fs.writeFileSync(path.join(dir, 'assets', 'a.js'), 'console.log(1)');
    fs.writeFileSync(path.join(dir, 'favicon.svg'), '<svg/>');
    return buildApp({ config: testConfig({ staticDir: dir }) }).app;
  }

  it('serves index.html with the same nonce as the CSP header', async () => {
    const app = withStaticDir();
    const res = await request(app).get('/some/spa/route');
    const nonce = /'nonce-([^']+)'/.exec(String(res.headers['content-security-policy']))?.[1];
    expect(nonce).toBeTruthy();
    expect(res.text).toContain(`<script nonce="${nonce}"`);
    expect(res.text).toContain(`<link rel="stylesheet" nonce="${nonce}"`);
    expect(res.text).toContain(`<meta property="csp-nonce" nonce="${nonce}" />`);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves hashed assets as immutable and ignores non-GET fallbacks', async () => {
    const app = withStaticDir();
    const asset = await request(app).get('/assets/a.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    expect((await request(app).get('/favicon.svg')).status).toBe(200);
    expect((await request(app).post('/anything')).status).toBe(404);
  });

  it('injectNonce rewrites every script tag', () => {
    expect(injectNonce('<head></head><script></script><script src="x">', 'N')).toBe(
      '<head><meta property="csp-nonce" nonce="N" /></head><script nonce="N"></script><script nonce="N" src="x">',
    );
  });
});
