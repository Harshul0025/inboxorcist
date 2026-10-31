import { describe, expect, it, vi } from 'vitest';
import type { LlmClient } from '../../server/llm';
import type { Logger } from '../../server/logger';
import { createGameMaster, mergeProposal } from '../../server/services/gameMaster';
import { groups, stats } from './helpers';

const twoGroups = [
  ...groups,
  { sender: 'riya@gmail.com', senderName: 'Riya', count: 1, samples: [{ id: 'm2', subject: 'Call me', snippet: '' }] },
];

function llm(result: unknown): LlmClient & { generateJson: ReturnType<typeof vi.fn> } {
  return { generateJson: vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result))) };
}

function capturingLogger() {
  const lines: string[] = [];
  const logger: Logger = {
    log: (severity, message, fields) => lines.push(JSON.stringify({ severity, message, ...fields })),
  };
  return { logger, lines };
}

const geminiVerdict = {
  sender: 'offers@swiggy.in',
  category: 'Food',
  action: 'banish',
  confidence: 0.95,
  isImportant: false,
  bossName: 'The Biryani Banshee',
  taunt: 'Biryani again?',
  summary: 'Food delivery promotions',
};

describe('mergeProposal', () => {
  it('prefers valid Gemini verdicts and fills gaps with the rulebook', () => {
    const proposal = mergeProposal(twoGroups, [geminiVerdict], []);
    expect(proposal.source).toBe('gemini');
    expect(proposal.verdicts[0]?.bossName).toBe('The Biryani Banshee');
    expect(proposal.verdicts[1]).toMatchObject({ sender: 'riya@gmail.com', category: 'Personal' });
  });

  it('never lets Gemini bulk-banish an important sender', () => {
    const proposal = mergeProposal(twoGroups, [{ ...geminiVerdict, sender: 'riya@gmail.com', isImportant: false }], []);
    expect(proposal.verdicts[1]).toMatchObject({ isImportant: true, action: 'rescue' });
  });

  it('drops invalid or unknown verdicts and unknown ids, and clamps long text', () => {
    const proposal = mergeProposal(
      twoGroups,
      [
        null,
        'junk',
        { ...geminiVerdict, action: 'delete' },
        { ...geminiVerdict, sender: 'stranger@x.com' },
        { ...geminiVerdict, taunt: 'x'.repeat(500), bossName: 'y'.repeat(200) },
      ],
      ['m1', 'not-a-sample'],
    );
    expect(proposal.verdicts[0]?.taunt.length).toBeLessThanOrEqual(160);
    expect(proposal.verdicts[0]?.bossName.length).toBeLessThanOrEqual(60);
    expect(proposal.importantIds).toEqual(expect.arrayContaining(['m1', 'm2']));
    expect(proposal.importantIds).not.toContain('not-a-sample');
  });

  it('reports fallback when Gemini returned nothing usable', () => {
    expect(mergeProposal(twoGroups, [], []).source).toBe('fallback');
  });
});

describe('createGameMaster', () => {
  it('splits big inboxes into parallel batches and keeps Gemini results when one batch fails', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      sender: `promo${i}@shop.example`,
      senderName: `Shop ${i}`,
      count: 10,
      samples: [{ id: `id${i}`, subject: 'Sale', snippet: '' }],
    }));
    let call = 0;
    const client: LlmClient = {
      generateJson: vi.fn((prompt: string) => {
        call += 1;
        if (call === 2) return Promise.reject(new Error('quota'));
        const senders = [...prompt.matchAll(/promo\d+@shop\.example/g)].map((m) => m[0]);
        return Promise.resolve({
          verdicts: senders.map((sender) => ({ ...geminiVerdict, sender, bossName: `Boss ${sender}` })),
          importantIds: [],
        });
      }),
    };
    const { logger, lines } = capturingLogger();
    const proposal = await createGameMaster(client, logger).propose(many);
    expect(client.generateJson).toHaveBeenCalledTimes(3);
    expect(proposal.source).toBe('gemini');
    expect(proposal.verdicts).toHaveLength(20);
    expect(proposal.verdicts.filter((v) => v.bossName.startsWith('Boss ')).length).toBe(12);
    expect(lines.some((line) => line.includes('some proposal batches failed'))).toBe(true);
  });

  it('uses the rulebook when Gemini is not configured', async () => {
    const { logger } = capturingLogger();
    const gm = createGameMaster(null, logger);
    expect((await gm.propose(groups)).source).toBe('fallback');
    expect((await gm.roast(stats, [])).source).toBe('fallback');
    expect((await gm.draft({ senderName: 'A', subject: 'B', snippet: '' })).source).toBe('fallback');
  });

  it('wraps untrusted email content in data tags', async () => {
    const client = llm({ verdicts: [geminiVerdict], importantIds: [] });
    const gm = createGameMaster(client, capturingLogger().logger);
    expect((await gm.propose(groups)).source).toBe('gemini');
    const prompt = String(client.generateJson.mock.calls[0]?.[0]);
    expect(prompt).toMatch(/<data>[\s\S]*offers@swiggy\.in[\s\S]*<\/data>/);
  });

  it('falls back on errors and invalid shapes, logging no email content', async () => {
    const { logger, lines } = capturingLogger();
    const failing = createGameMaster(llm(new Error('quota')), logger);
    expect((await failing.propose(groups)).source).toBe('fallback');
    const invalid = createGameMaster(llm({ wrong: true }), logger);
    expect((await invalid.roast(stats, [])).source).toBe('fallback');
    expect((await invalid.draft({ senderName: 'Riya', subject: 'Secret plan', snippet: '' })).source).toBe('fallback');
    expect(lines.join('\n')).not.toMatch(/swiggy|Secret plan|Riya/i);
    expect(lines.some((line) => line.includes('WARNING'))).toBe(true);
  });

  it('returns Gemini roasts and drafts, cleaned and clamped', async () => {
    const gm = createGameMaster(
      llm({ lines: ['Line\none', 'Line two'], body: '  Hello!  ' }),
      capturingLogger().logger,
    );
    expect(await gm.roast(stats, ['Food'])).toEqual({ lines: ['Line one', 'Line two'], source: 'gemini' });
    expect(await gm.draft({ senderName: 'A', subject: 'B', snippet: '' })).toEqual({
      body: 'Hello!',
      source: 'gemini',
    });
  });
});
