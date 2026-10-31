import { describe, expect, it } from 'vitest';
import { fallbackProposal } from '../../../shared/classifier';
import { GHOSTS_PER_WAVE, GMAIL_BATCH_MODIFY_MAX, MAX_BOSSES } from '../../../shared/constants';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { bossChunkSize, buildEncounters } from '../../../src/lib/encounters';

async function demoPlan() {
  const scan = await new DemoAdapter({ latencyMs: 0 }).scan();
  const proposal = fallbackProposal(scan.groups);
  return { scan, proposal, plan: buildEncounters(scan, proposal) };
}

describe('buildEncounters', () => {
  it('creates bosses for big, confidently banishable senders only', async () => {
    const { plan } = await demoPlan();
    const bosses = plan.encounters.flatMap((e) => (e.kind === 'boss' ? [e.boss] : []));
    expect(bosses.length).toBeGreaterThan(0);
    expect(bosses.length).toBeLessThanOrEqual(MAX_BOSSES);
    for (const boss of bosses) {
      const verdict = plan.verdicts.get(boss.sender);
      expect(verdict?.action).toBe('banish');
      expect(verdict?.isImportant).toBe(false);
    }
  });

  it('never lets important mail become a ghost or a boss', async () => {
    const { plan } = await demoPlan();
    const ghosts = plan.encounters.flatMap((e) => (e.kind === 'ghosts' ? e.ghosts : []));
    expect(ghosts.every((g) => !plan.importantIds.has(g.email.id))).toBe(true);
    const souls = plan.encounters.find((e) => e.kind === 'souls');
    expect(souls?.kind === 'souls' && souls.ghosts.every((g) => g.isImportant && g.suggestion === 'rescue')).toBe(true);
  });

  it('keeps boss senders out of ghost waves and caps wave size', async () => {
    const { plan } = await demoPlan();
    const bossSenders = new Set(plan.encounters.flatMap((e) => (e.kind === 'boss' ? [e.boss.sender] : [])));
    for (const encounter of plan.encounters) {
      if (encounter.kind !== 'ghosts') continue;
      expect(encounter.ghosts.length).toBeLessThanOrEqual(GHOSTS_PER_WAVE);
      expect(encounter.ghosts.some((g) => bossSenders.has(g.email.senderEmail))).toBe(false);
    }
  });

  it('interleaves bosses and waves and ends with the souls', async () => {
    const { plan } = await demoPlan();
    expect(plan.encounters[0]?.kind).toBe('boss');
    expect(plan.encounters.at(-1)?.kind).toBe('souls');
  });

  it('carries one-click unsubscribe URLs onto bosses', async () => {
    const { plan } = await demoPlan();
    const swiggy = plan.encounters.find((e) => e.kind === 'boss' && e.boss.sender === 'offers@swiggy.in');
    expect(swiggy?.kind === 'boss' && swiggy.boss.unsubscribeUrl).toMatch(/^https:/);
  });

  it('returns no encounters for an empty inbox', () => {
    const plan = buildEncounters(
      { totalUnread: 0, emails: [], groups: [] },
      { verdicts: [], importantIds: [], source: 'fallback' },
    );
    expect(plan.encounters).toEqual([]);
  });
});

describe('bossChunkSize', () => {
  it('kills a boss in about eight hits and respects the Gmail limit', () => {
    expect(bossChunkSize(80)).toBe(10);
    expect(bossChunkSize(3)).toBe(1);
    expect(bossChunkSize(0)).toBe(1);
    expect(bossChunkSize(1_000_000)).toBe(GMAIL_BATCH_MODIFY_MAX);
  });
});
