import { z } from 'zod';
import {
  RAID_CODE_ALPHABET,
  RAID_CODE_LENGTH,
  RAID_MAX_TAPS_PER_FLUSH,
  RAID_MAX_VOTES,
  RAID_NAME_MAX,
} from '../../../shared/constants';
import { cleanText } from '../../../shared/text';
import type { BossSpec, EncounterPlan, GhostSpec } from '../../lib/encounters';

const roomPlayerSchema = z.object({
  name: z.string(),
  online: z.boolean(),
  joinedAt: z.number().optional(),
});

/**
 * Shape of `rooms/{code}` in the Realtime Database. It only ever holds
 * summaries, never senders or subjects. Snapshots are validated against it
 * because database data is untrusted input.
 */
export const roomStateSchema = z.object({
  hostUid: z.string(),
  status: z.enum(['lobby', 'boss', 'vote', 'souls', 'ended']),
  hostOnline: z.boolean(),
  createdAt: z.number(),
  boss: z.object({ summary: z.string(), hp: z.number(), maxHp: z.number() }).optional(),
  vote: z.object({ id: z.string(), summary: z.string(), endsAt: z.number() }).optional(),
  lastResult: z.string().optional(),
  stats: z.object({ cleared: z.number(), durationMs: z.number() }).optional(),
  players: z.record(z.string(), roomPlayerSchema).optional(),
  taps: z.record(z.string(), z.number()).optional(),
  /** Choices stay plain strings here; `tallyVotes` ignores anything that is not banish or keep. */
  votes: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

export type RoomState = z.infer<typeof roomStateSchema>;
export type RoomStatus = RoomState['status'];
export type RoomPlayer = z.infer<typeof roomPlayerSchema>;
export type VoteChoice = 'banish' | 'keep';

/**
 * Validates a raw database snapshot; returns null for missing or malformed rooms.
 * @param raw Value from `snapshot.val()`.
 */
export function parseRoomState(raw: unknown): RoomState | null {
  const parsed = roomStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type RaidStep =
  | { kind: 'boss'; boss: BossSpec }
  | { kind: 'vote'; ghost: GhostSpec; voteId: string }
  | { kind: 'souls'; ghosts: GhostSpec[] };

/**
 * Generates a room code from an unambiguous alphabet (no I or O).
 * @param random Random source.
 */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < RAID_CODE_LENGTH; i += 1) {
    code += RAID_CODE_ALPHABET[Math.floor(random() * RAID_CODE_ALPHABET.length)] ?? 'A';
  }
  return code;
}

/**
 * Cleans a player nickname; returns null when nothing usable is left.
 * @param raw Untrusted input.
 */
export function sanitizeNickname(raw: string): string | null {
  const name = cleanText(raw).slice(0, RAID_NAME_MAX).trim();
  return name.length > 0 ? name : null;
}

/**
 * Total taps across all players.
 * @param taps Map of player uid to cumulative taps.
 */
export function sumTaps(taps: Record<string, number> | undefined): number {
  return Object.values(taps ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

/**
 * How many new hits the combined taps have earned since the fight began.
 * Hits land on fixed tap boundaries (every `tapsPerHit` combined taps), so
 * the "taps to next hit" meter is simply `totalTaps % tapsPerHit`.
 * @param totalTaps Current combined taps.
 * @param baseline Combined taps when the fight started.
 * @param hitsSoFar Hits already executed in this fight.
 * @param tapsPerHit Taps needed per hit.
 */
export function newHits(totalTaps: number, baseline: number, hitsSoFar: number, tapsPerHit: number): number {
  const earned = Math.floor(totalTaps / tapsPerHit) - Math.floor(baseline / tapsPerHit);
  return Math.max(0, earned - hitsSoFar);
}

/**
 * Caps how many taps one flush may add (mirrors the database rule).
 * @param pending Taps buffered on the client.
 */
export function clampTapFlush(pending: number): number {
  return Math.max(0, Math.min(pending, RAID_MAX_TAPS_PER_FLUSH));
}

/**
 * Counts votes. Ties keep the email: when in doubt, the safe choice wins.
 * @param votes Map of player uid to choice (untrusted database data).
 */
export function tallyVotes(votes: Record<string, string> | undefined): {
  banish: number;
  keep: number;
  winner: VoteChoice;
} {
  let banish = 0;
  let keep = 0;
  for (const choice of Object.values(votes ?? {})) {
    if (choice === 'banish') banish += 1;
    else if (choice === 'keep') keep += 1;
  }
  return { banish, keep, winner: banish > keep ? 'banish' : 'keep' };
}

/**
 * Ranks players by taps for the MVP board.
 * @param players Room players.
 * @param taps Cumulative taps per player.
 * @param limit Number of entries to return.
 */
export function rankMvps(
  players: Record<string, RoomPlayer> | undefined,
  taps: Record<string, number> | undefined,
  limit = 5,
): { name: string; taps: number }[] {
  return Object.entries(players ?? {})
    .map(([uid, player]) => ({ name: player.name, taps: taps?.[uid] ?? 0 }))
    .sort((a, b) => b.taps - a.taps || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Flattens an encounter plan into raid steps: bosses stay bosses, uncertain
 * ghosts become crowd votes (capped), and souls stay host-only.
 * @param plan Encounter plan.
 * @param maxVotes Maximum number of crowd votes.
 */
export function buildRaidSteps(plan: EncounterPlan, maxVotes: number = RAID_MAX_VOTES): RaidStep[] {
  const steps: RaidStep[] = [];
  let votes = 0;
  for (const encounter of plan.encounters) {
    if (encounter.kind === 'boss') {
      steps.push({ kind: 'boss', boss: encounter.boss });
    } else if (encounter.kind === 'ghosts') {
      for (const ghost of encounter.ghosts) {
        if (votes >= maxVotes) break;
        steps.push({ kind: 'vote', ghost, voteId: `v${votes}` });
        votes += 1;
      }
    } else {
      steps.push({ kind: 'souls', ghosts: encounter.ghosts });
    }
  }
  return steps;
}
