import { z } from 'zod';
import { fallbackProposal } from '../../shared/classifier.js';
import { fallbackDraft, fallbackRoast } from '../../shared/fallbacks.js';
import {
  BOSS_NAME_MAX,
  DRAFT_MAX,
  EPITAPH_MAX,
  GEMINI_TIMEOUT_MS,
  PLEA_MAX,
  PROPOSE_BATCH_SIZE,
  RAID_SUMMARY_MAX,
  ROAST_LINE_MAX,
  TAUNT_MAX,
} from '../../shared/constants.js';
import { senderVerdictSchema } from '../../shared/schemas.js';
import { cleanText, truncate } from '../../shared/text.js';
import type {
  DraftReply,
  DraftRequest,
  Proposal,
  Roast,
  RunStats,
  SenderGroup,
  SenderVerdict,
} from '../../shared/types.js';
import { type LlmClient, LlmError } from '../llm.js';
import type { Logger } from '../logger.js';

const verdictJsonSchema = {
  type: 'object',
  properties: {
    sender: { type: 'string' },
    category: { type: 'string', description: 'Short category, e.g. "Food delivery".' },
    action: { type: 'string', enum: ['banish', 'keep', 'rescue'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    isImportant: {
      type: 'boolean',
      description: 'True for real people, money, bills, deadlines, security or anything risky to archive.',
    },
    bossName: { type: 'string', description: `Spooky alliterative boss name, max ${BOSS_NAME_MAX} chars.` },
    taunt: { type: 'string', description: `One funny line referencing the actual emails, max ${TAUNT_MAX} chars.` },
    summary: {
      type: 'string',
      description: `Privacy-safe description with NO names, addresses or subjects, max ${RAID_SUMMARY_MAX} chars.`,
    },
    plea: {
      type: 'string',
      description: `What the boss desperately begs at half health, funny and in character, max ${PLEA_MAX} chars.`,
    },
    epitaph: {
      type: 'string',
      description: `Funny one-line tombstone shown when the boss is defeated, referencing its emails, max ${EPITAPH_MAX} chars.`,
    },
  },
  required: [
    'sender',
    'category',
    'action',
    'confidence',
    'isImportant',
    'bossName',
    'taunt',
    'summary',
    'plea',
    'epitaph',
  ],
} as const;

const proposalJsonSchema = {
  type: 'object',
  properties: {
    verdicts: { type: 'array', items: verdictJsonSchema },
    importantIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdicts', 'importantIds'],
} as const;

const llmProposalSchema = z.object({
  verdicts: z.array(z.unknown()),
  importantIds: z.array(z.string()),
});

const roastJsonSchema = {
  type: 'object',
  properties: { lines: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 } },
  required: ['lines'],
} as const;

const draftJsonSchema = {
  type: 'object',
  properties: { body: { type: 'string' } },
  required: ['body'],
} as const;

function clampText(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const clean = truncate(cleanText(value), max);
  return clean.length > 0 ? clean : fallback;
}

function clampVerdict(raw: unknown, rules: ReadonlyMap<string, SenderVerdict>): SenderVerdict | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const rule = typeof record.sender === 'string' ? rules.get(record.sender) : undefined;
  const candidate = {
    ...record,
    // Story lines are optional extras: fall back to the rulebook rather than dropping the verdict.
    plea: clampText(record.plea, PLEA_MAX, rule?.plea),
    epitaph: clampText(record.epitaph, EPITAPH_MAX, rule?.epitaph),
    bossName: typeof record.bossName === 'string' ? truncate(cleanText(record.bossName), BOSS_NAME_MAX) : '',
    taunt: typeof record.taunt === 'string' ? truncate(cleanText(record.taunt), TAUNT_MAX) : '',
    summary: typeof record.summary === 'string' ? truncate(cleanText(record.summary), RAID_SUMMARY_MAX) : '',
    category: typeof record.category === 'string' ? truncate(cleanText(record.category), 60) : '',
  };
  const parsed = senderVerdictSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Merges Gemini's verdicts with the rule-based fallback so every sender gets
 * a verdict, and important flags from either source are kept (safety wins).
 * @param groups Sender groups that were sent to Gemini.
 * @param rawVerdicts Unvalidated verdicts from Gemini.
 * @param rawImportantIds Unvalidated important message IDs from Gemini.
 */
export function mergeProposal(
  groups: readonly SenderGroup[],
  rawVerdicts: readonly unknown[],
  rawImportantIds: readonly string[],
): Proposal {
  const fallback = fallbackProposal(groups);
  const known = new Set(groups.map((group) => group.sender));
  const rules = new Map(fallback.verdicts.map((verdict) => [verdict.sender, verdict]));
  const fromLlm = new Map<string, SenderVerdict>();
  for (const raw of rawVerdicts) {
    const verdict = clampVerdict(raw, rules);
    if (verdict && known.has(verdict.sender)) fromLlm.set(verdict.sender, verdict);
  }

  const verdicts = fallback.verdicts.map((rule) => {
    const llm = fromLlm.get(rule.sender);
    if (!llm) return rule;
    const isImportant = llm.isImportant || rule.isImportant;
    return {
      ...llm,
      isImportant,
      // An important sender must never be bulk-banished, whatever the model says.
      action: isImportant && llm.action === 'banish' ? 'rescue' : llm.action,
    } satisfies SenderVerdict;
  });

  const sampleIds = new Set(groups.flatMap((group) => group.samples.map((sample) => sample.id)));
  const importantIds = new Set(fallback.importantIds);
  for (const id of rawImportantIds) if (sampleIds.has(id)) importantIds.add(id);

  return { verdicts, importantIds: [...importantIds], source: fromLlm.size > 0 ? 'gemini' : 'fallback' };
}

function chunkGroups(groups: readonly SenderGroup[], size: number): SenderGroup[][] {
  const batches: SenderGroup[][] = [];
  for (let i = 0; i < groups.length; i += size) batches.push(groups.slice(i, i + size));
  return batches;
}

function buildProposalPrompt(groups: readonly SenderGroup[]): string {
  return [
    'Classify each email sender below for an inbox clean-up game.',
    'For every sender return exactly one verdict with the same "sender" value.',
    'action: "banish" = safe to mark read and archive (promotions, notifications, newsletters);',
    '"keep" = leave untouched; "rescue" = important, star it for a reply.',
    'Mark isImportant=true for real people, money, bills, deadlines, security codes or anything risky.',
    'Make bossName, taunt, plea and epitaph genuinely funny, Halloween-themed and specific to the emails.',
    'Also list in importantIds the sample ids of individual emails that look important.',
    '<data>',
    JSON.stringify(groups),
    '</data>',
  ].join('\n');
}

export interface GameMaster {
  propose(groups: readonly SenderGroup[]): Promise<Proposal>;
  roast(stats: RunStats, categories: readonly string[]): Promise<Roast>;
  draft(request: DraftRequest): Promise<DraftReply>;
}

/**
 * Creates the Gemini-backed game master. Every method degrades to a
 * deterministic fallback, so the game keeps working without Gemini.
 * @param llm Gemini client, or null when no API key is configured.
 * @param logger Structured logger (never receives email content).
 * @param timeoutMs Per-call Gemini timeout.
 */
export function createGameMaster(
  llm: LlmClient | null,
  logger: Logger,
  timeoutMs: number = GEMINI_TIMEOUT_MS,
): GameMaster {
  async function attempt<T>(operation: string, run: (client: LlmClient) => Promise<T>, fallback: () => T): Promise<T> {
    if (!llm) return fallback();
    const started = Date.now();
    try {
      const result = await run(llm);
      logger.log('INFO', 'gemini call succeeded', { operation, latencyMs: Date.now() - started });
      return result;
    } catch (error) {
      logger.log('WARNING', 'gemini call failed, using fallback', {
        operation,
        latencyMs: Date.now() - started,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return fallback();
    }
  }

  return {
    propose(groups) {
      return attempt(
        'propose',
        async (client) => {
          // Smaller parallel batches answer much faster than one big call, and a
          // failed batch only falls back for its own senders.
          const batches = chunkGroups(groups, PROPOSE_BATCH_SIZE);
          const results = await Promise.allSettled(
            batches.map(async (batch) =>
              llmProposalSchema.parse(
                await client.generateJson(buildProposalPrompt(batch), proposalJsonSchema, timeoutMs),
              ),
            ),
          );
          const succeeded = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
          if (succeeded.length === 0) throw new LlmError('Every proposal batch failed');
          if (succeeded.length < batches.length) {
            logger.log('WARNING', 'some proposal batches failed', { failed: batches.length - succeeded.length });
          }
          return mergeProposal(
            groups,
            succeeded.flatMap((batch) => batch.verdicts),
            succeeded.flatMap((batch) => batch.importantIds),
          );
        },
        () => fallbackProposal(groups),
      );
    },

    roast(stats, categories) {
      return attempt(
        'roast',
        async (client) => {
          const prompt = [
            'Write exactly two short, friendly, funny lines roasting the player about their inbox,',
            `each under ${ROAST_LINE_MAX} characters. Use the stats and categories below.`,
            '<data>',
            JSON.stringify({ stats, categories }),
            '</data>',
          ].join('\n');
          const raw = await client.generateJson(prompt, roastJsonSchema, timeoutMs);
          const lines = z.object({ lines: z.array(z.string().min(1)).length(2) }).parse(raw).lines;
          return {
            lines: [
              truncate(cleanText(lines[0] ?? ''), ROAST_LINE_MAX),
              truncate(cleanText(lines[1] ?? ''), ROAST_LINE_MAX),
            ],
            source: 'gemini',
          } satisfies Roast;
        },
        () => fallbackRoast(stats),
      );
    },

    draft(request) {
      return attempt(
        'draft',
        async (client) => {
          const prompt = [
            'Write a short, polite plain-text reply to the email below.',
            'Do not invent facts, dates or commitments; keep it to 2-4 sentences and sign off with "Best regards".',
            '<data>',
            JSON.stringify(request),
            '</data>',
          ].join('\n');
          const raw = await client.generateJson(prompt, draftJsonSchema, timeoutMs);
          const body = z.object({ body: z.string().min(1) }).parse(raw).body;
          return { body: truncate(body.trim(), DRAFT_MAX), source: 'gemini' } satisfies DraftReply;
        },
        () => fallbackDraft(request),
      );
    },
  };
}
