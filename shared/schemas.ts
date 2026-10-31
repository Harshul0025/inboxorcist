import { z } from 'zod';
import {
  BOSS_NAME_MAX,
  DRAFT_MAX,
  PROPOSE_MAX_GROUPS,
  PROPOSE_MAX_SAMPLES,
  RAID_SUMMARY_MAX,
  ROAST_LINE_MAX,
  TAUNT_MAX,
  TEXT_FIELD_MAX,
} from './constants.js';

// Zod probes for `new Function` support to speed up parsing. Our strict CSP
// forbids eval, so turn the probe (and the JIT) off instead of tripping CSP.
z.config({ jitless: true });

const text = z.string().max(TEXT_FIELD_MAX);

export const choreActionSchema = z.enum(['banish', 'keep', 'rescue']);

export const emailSampleSchema = z.object({
  id: z.string().min(1).max(128),
  subject: text,
  snippet: text,
});

export const senderGroupSchema = z.object({
  sender: z.string().min(1).max(TEXT_FIELD_MAX),
  senderName: text,
  count: z.number().int().min(1).max(1_000_000),
  samples: z.array(emailSampleSchema).max(PROPOSE_MAX_SAMPLES),
});

export const proposeRequestSchema = z.object({
  groups: z.array(senderGroupSchema).min(1).max(PROPOSE_MAX_GROUPS),
});

export const senderVerdictSchema = z.object({
  sender: z.string().min(1).max(TEXT_FIELD_MAX),
  category: z.string().min(1).max(60),
  action: choreActionSchema,
  confidence: z.number().min(0).max(1),
  isImportant: z.boolean(),
  bossName: z.string().min(1).max(BOSS_NAME_MAX),
  taunt: z.string().min(1).max(TAUNT_MAX),
  summary: z.string().min(1).max(RAID_SUMMARY_MAX),
});

export const proposalSchema = z.object({
  verdicts: z.array(senderVerdictSchema),
  importantIds: z.array(z.string().max(128)),
  source: z.enum(['gemini', 'fallback']),
});

export const runStatsSchema = z.object({
  cleared: z.number().int().min(0),
  rescued: z.number().int().min(0),
  kept: z.number().int().min(0),
  sealed: z.number().int().min(0),
  bossesDefeated: z.number().int().min(0),
  durationMs: z.number().min(0),
  unreadBefore: z.number().int().min(0),
  unreadAfter: z.number().int().min(0),
  bestCombo: z.number().int().min(0),
  score: z.number().int().min(0),
});

export const roastRequestSchema = z.object({
  stats: runStatsSchema,
  categories: z.array(z.string().max(60)).max(PROPOSE_MAX_GROUPS),
});

export const roastSchema = z.object({
  lines: z.tuple([z.string().min(1).max(ROAST_LINE_MAX), z.string().min(1).max(ROAST_LINE_MAX)]),
  source: z.enum(['gemini', 'fallback']),
});

export const draftRequestSchema = z.object({
  senderName: text,
  subject: text,
  snippet: text,
});

export const draftReplySchema = z.object({
  body: z.string().min(1).max(DRAFT_MAX),
  source: z.enum(['gemini', 'fallback']),
});

export const unsubscribeRequestSchema = z.object({
  url: z.url({ protocol: /^https$/ }).max(2_048),
});

export const unsubscribeResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
});

export const firebaseWebConfigSchema = z.object({
  apiKey: z.string(),
  authDomain: z.string(),
  databaseURL: z.string(),
  projectId: z.string(),
  appId: z.string(),
});

export const publicConfigSchema = z.object({
  googleClientId: z.string().nullable(),
  firebase: firebaseWebConfigSchema.nullable(),
  recaptchaSiteKey: z.string().nullable(),
  useEmulators: z.boolean(),
});

export type ProposeRequest = z.infer<typeof proposeRequestSchema>;
export type RoastRequest = z.infer<typeof roastRequestSchema>;
