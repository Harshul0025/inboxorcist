/** What the player decides for an email or a whole sender. */
export type ChoreAction = 'banish' | 'keep' | 'rescue';

/** A single unread email, reduced to the fields the game needs. */
export interface EmailItem {
  id: string;
  threadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  snippet: string;
  /** RFC 5322 Message-ID, used to thread reply drafts. */
  messageIdHeader?: string;
  /** HTTPS URL that supports RFC 8058 one-click unsubscribe. */
  unsubscribeUrl?: string;
}

/** A short sample of one email, as sent to Gemini. */
export interface EmailSample {
  id: string;
  subject: string;
  snippet: string;
}

/** All sampled unread mail from one sender. */
export interface SenderGroup {
  sender: string;
  senderName: string;
  count: number;
  samples: EmailSample[];
}

/** Gemini's (or the fallback classifier's) verdict for one sender. */
export interface SenderVerdict {
  sender: string;
  category: string;
  action: ChoreAction;
  confidence: number;
  isImportant: boolean;
  bossName: string;
  taunt: string;
  /** Privacy-safe description with no names or subjects, shown to raid players. */
  summary: string;
  /** What the boss begs at half health (storyboard notification). */
  plea: string;
  /** One-liner shown when the boss is defeated (storyboard notification). */
  epitaph: string;
}

export interface Proposal {
  verdicts: SenderVerdict[];
  importantIds: string[];
  source: 'gemini' | 'fallback';
}

/** End-of-run numbers, used for the end screen and the roast. */
export interface RunStats {
  cleared: number;
  rescued: number;
  kept: number;
  sealed: number;
  bossesDefeated: number;
  durationMs: number;
  unreadBefore: number;
  unreadAfter: number;
  bestCombo: number;
  score: number;
}

export interface Roast {
  lines: [string, string];
  source: 'gemini' | 'fallback';
}

export interface DraftRequest {
  senderName: string;
  subject: string;
  snippet: string;
}

export interface DraftReply {
  body: string;
  source: 'gemini' | 'fallback';
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

/** Runtime configuration the server exposes to the browser. All values are public by design. */
export interface PublicConfig {
  googleClientId: string | null;
  firebase: FirebaseWebConfig | null;
  recaptchaSiteKey: string | null;
  useEmulators: boolean;
}
