import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW' },
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return { models: { generateContent } };
  }),
}));

const verifyToken = vi.fn();
vi.mock('firebase-admin/app', () => ({ getApps: () => [], initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken }) }));

const { createGeminiClient, LlmError } = await import('../../server/llm');
const { createFirebaseAppCheckVerifier } = await import('../../server/middleware/appCheck');

describe('createGeminiClient', () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it('requests JSON with the schema and system instruction', async () => {
    generateContent.mockResolvedValue({ text: '{"ok":true}' });
    const client = createGeminiClient('key', 'gemini-test');
    await expect(client.generateJson('prompt', { type: 'object' }, 1000)).resolves.toEqual({ ok: true });
    const request = generateContent.mock.calls[0]?.[0];
    expect(request.model).toBe('gemini-test');
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseJsonSchema).toEqual({ type: 'object' });
    expect(request.config.systemInstruction).toContain('untrusted');
    expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(request.config.thinkingConfig).toBeUndefined();
  });

  it('passes the thinking level when configured', async () => {
    generateContent.mockResolvedValue({ text: '{}' });
    await createGeminiClient('key', 'm', 'MINIMAL').generateJson('p', {}, 1000);
    expect(generateContent.mock.calls[0]?.[0].config.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('rejects empty responses', async () => {
    generateContent.mockResolvedValue({ text: undefined });
    await expect(createGeminiClient('key', 'm').generateJson('p', {}, 1000)).rejects.toBeInstanceOf(LlmError);
  });
});

describe('createFirebaseAppCheckVerifier', () => {
  it('verifies tokens with the Admin SDK', async () => {
    verifyToken.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('bad'));
    const verify = await createFirebaseAppCheckVerifier('project');
    await expect(verify('good')).resolves.toBeUndefined();
    await expect(verify('bad')).rejects.toThrow('bad');
  });
});
