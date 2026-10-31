import {
  BOSS_HITS_TO_KILL,
  BOSS_MIN_EMAILS,
  GMAIL_BATCH_MODIFY_MAX,
  GHOSTS_PER_WAVE,
  LOW_CONFIDENCE_THRESHOLD,
  MAX_BOSSES,
  MAX_GHOSTS,
  MAX_SOULS,
} from '../../shared/constants';
import type { ChoreAction, EmailItem, Proposal, SenderVerdict } from '../../shared/types';
import type { ScanResult } from '../adapters/types';
import { chunk } from './async';

export interface BossSpec {
  sender: string;
  senderName: string;
  bossName: string;
  taunt: string;
  summary: string;
  category: string;
  /** Unread count seen in the sample; the real HP is loaded when the fight starts. */
  estimatedHp: number;
  unsubscribeUrl?: string;
}

export interface GhostSpec {
  email: EmailItem;
  suggestion: ChoreAction;
  confidence: number;
  isImportant: boolean;
  summary: string;
}

export type Encounter =
  { kind: 'boss'; boss: BossSpec } | { kind: 'ghosts'; ghosts: GhostSpec[] } | { kind: 'souls'; ghosts: GhostSpec[] };

export interface EncounterPlan {
  encounters: Encounter[];
  /** Ids that must never be bulk-banished. */
  importantIds: Set<string>;
  verdicts: Map<string, SenderVerdict>;
}

function toGhost(email: EmailItem, verdict: SenderVerdict | undefined, important: boolean): GhostSpec {
  return {
    email,
    suggestion: important ? 'rescue' : (verdict?.action ?? 'keep'),
    confidence: verdict?.confidence ?? 0.4,
    isImportant: important,
    summary: verdict?.summary ?? 'Mail that needs a human decision',
  };
}

/**
 * Turns a scan and Gemini's proposal into the ordered list of encounters:
 * boss fights for big safe-to-banish senders, ghost waves for uncertain
 * mail, and a final wave of trapped souls (important mail) to rescue.
 * @param scan Scan result.
 * @param proposal Gemini or fallback proposal.
 */
export function buildEncounters(scan: ScanResult, proposal: Proposal): EncounterPlan {
  const verdicts = new Map(proposal.verdicts.map((verdict) => [verdict.sender, verdict]));
  const importantSenders = new Set(proposal.verdicts.filter((v) => v.isImportant).map((v) => v.sender));
  const importantIds = new Set(proposal.importantIds);
  for (const email of scan.emails) if (importantSenders.has(email.senderEmail)) importantIds.add(email.id);

  const bosses: BossSpec[] = scan.groups
    .flatMap((group) => {
      const verdict = verdicts.get(group.sender);
      const eligible =
        verdict?.action === 'banish' &&
        !verdict.isImportant &&
        verdict.confidence >= LOW_CONFIDENCE_THRESHOLD &&
        group.count >= BOSS_MIN_EMAILS;
      return eligible ? [{ group, verdict }] : [];
    })
    .slice(0, MAX_BOSSES)
    .map(({ group, verdict }) => {
      const unsubscribeUrl = scan.emails.find(
        (e) => e.senderEmail === group.sender && e.unsubscribeUrl,
      )?.unsubscribeUrl;
      return {
        sender: group.sender,
        senderName: group.senderName,
        bossName: verdict.bossName,
        taunt: verdict.taunt,
        summary: verdict.summary,
        category: verdict.category,
        estimatedHp: group.count,
        ...(unsubscribeUrl ? { unsubscribeUrl } : {}),
      };
    });

  const bossSenders = new Set(bosses.map((boss) => boss.sender));
  const souls = scan.emails
    .filter((email) => importantIds.has(email.id))
    .slice(0, MAX_SOULS)
    .map((email) => toGhost(email, verdicts.get(email.senderEmail), true));

  // One ghost per sender keeps waves varied; uncertain senders come first.
  const seen = new Set<string>();
  const ghosts = scan.emails
    .filter((email) => !importantIds.has(email.id) && !bossSenders.has(email.senderEmail))
    .filter((email) => {
      if (seen.has(email.senderEmail)) return false;
      seen.add(email.senderEmail);
      return true;
    })
    .map((email) => toGhost(email, verdicts.get(email.senderEmail), false))
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, MAX_GHOSTS);

  const waves = chunk(ghosts, GHOSTS_PER_WAVE);
  const encounters: Encounter[] = [];
  const rounds = Math.max(bosses.length, waves.length);
  for (let i = 0; i < rounds; i += 1) {
    const boss = bosses[i];
    const wave = waves[i];
    if (boss) encounters.push({ kind: 'boss', boss });
    if (wave) encounters.push({ kind: 'ghosts', ghosts: wave });
  }
  if (souls.length > 0) encounters.push({ kind: 'souls', ghosts: souls });

  return { encounters, importantIds, verdicts };
}

/**
 * Emails cleared per boss hit, chosen so every boss dies in about
 * `BOSS_HITS_TO_KILL` hits, capped by Gmail's batchModify limit.
 * @param total Total emails behind the boss.
 */
export function bossChunkSize(total: number): number {
  return Math.min(GMAIL_BATCH_MODIFY_MAX, Math.max(1, Math.ceil(total / BOSS_HITS_TO_KILL)));
}
