import { describe, expect, it } from 'vitest';
import { fallbackProposal } from '../../../shared/classifier';
import { RAID_MAX_TAPS_PER_FLUSH } from '../../../shared/constants';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { buildEncounters } from '../../../src/lib/encounters';
import {
  buildRaidSteps,
  clampTapFlush,
  generateRoomCode,
  newHits,
  parseRoomState,
  rankMvps,
  sanitizeNickname,
  sumTaps,
  tallyVotes,
} from '../../../src/features/raid/raidLogic';

describe('raid logic', () => {
  it('generates 4-letter codes without ambiguous letters', () => {
    let seed = 0;
    for (let i = 0; i < 50; i += 1) {
      const code = generateRoomCode(() => (seed = (seed + 0.137) % 1));
      expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    }
  });

  it('sanitises nicknames', () => {
    expect(sanitizeNickname('  Ghost\nBuster  ')).toBe('Ghost Buster');
    expect(sanitizeNickname('x'.repeat(50))).toHaveLength(20);
    expect(sanitizeNickname('   ')).toBeNull();
  });

  it('sums taps and ignores junk values', () => {
    expect(sumTaps({ a: 10, b: 5, c: Number.NaN })).toBe(15);
    expect(sumTaps(undefined)).toBe(0);
  });

  it('awards hits on fixed tap boundaries', () => {
    expect(newHits(149, 100, 0, 50)).toBe(0);
    expect(newHits(150, 100, 0, 50)).toBe(1);
    expect(newHits(260, 100, 1, 50)).toBe(2);
    expect(newHits(90, 100, 0, 50)).toBe(0);
  });

  it('clamps tap flushes like the database rule', () => {
    expect(clampTapFlush(5)).toBe(5);
    expect(clampTapFlush(10_000)).toBe(RAID_MAX_TAPS_PER_FLUSH);
    expect(clampTapFlush(-3)).toBe(0);
  });

  it('tallies votes, keeping on ties and ignoring invalid values', () => {
    expect(tallyVotes({ a: 'banish', b: 'banish', c: 'keep' })).toEqual({ banish: 2, keep: 1, winner: 'banish' });
    expect(tallyVotes({ a: 'banish', b: 'keep', c: 'delete-all' })).toEqual({ banish: 1, keep: 1, winner: 'keep' });
    expect(tallyVotes(undefined).winner).toBe('keep');
  });

  it('ranks MVPs by taps', () => {
    const players = {
      a: { name: 'Asha', online: true },
      b: { name: 'Bilal', online: true },
      c: { name: 'Chen', online: false },
    };
    expect(rankMvps(players, { a: 10, b: 30 })).toEqual([
      { name: 'Bilal', taps: 30 },
      { name: 'Asha', taps: 10 },
      { name: 'Chen', taps: 0 },
    ]);
    expect(rankMvps(undefined, undefined)).toEqual([]);
  });

  it('validates room snapshots from the database', () => {
    const room = { hostUid: 'h', status: 'boss', hostOnline: true, createdAt: 1, taps: { p1: 4 }, extra: 'ignored' };
    expect(parseRoomState(room)).toEqual({
      hostUid: 'h',
      status: 'boss',
      hostOnline: true,
      createdAt: 1,
      taps: { p1: 4 },
    });
    expect(parseRoomState({ ...room, status: 'hacked' })).toBeNull();
    expect(parseRoomState({ ...room, taps: { p1: 'lots' } })).toBeNull();
    expect(parseRoomState(null)).toBeNull();
  });

  it('turns ghost waves into a capped number of crowd votes', async () => {
    const scan = await new DemoAdapter({ latencyMs: 0 }).scan();
    const plan = buildEncounters(scan, fallbackProposal(scan.groups));
    const steps = buildRaidSteps(plan, 3);
    expect(steps.flatMap((s) => (s.kind === 'vote' ? [s.voteId] : []))).toEqual(['v0', 'v1', 'v2']);
    expect(steps.some((s) => s.kind === 'boss')).toBe(true);
    expect(steps.at(-1)?.kind).toBe('souls');
  });
});
