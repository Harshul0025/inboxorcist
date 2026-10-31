import type { EmailItem, SenderGroup } from '../../shared/types';

export interface ScanResult {
  /** Exact unread count in the inbox when the scan started. */
  totalUnread: number;
  /** Sample of the most recent unread emails. */
  emails: EmailItem[];
  /** The sample grouped by sender. */
  groups: SenderGroup[];
}

export interface SealTarget {
  sender: string;
  unsubscribeUrl?: string;
}

export interface SealResult {
  filtered: boolean;
  unsubscribed: boolean;
}

/** Actions that change mail. "keep" deliberately never touches the mailbox. */
export type MailAction = 'banish' | 'rescue';

/**
 * A pluggable source of chores. Gmail and the offline demo inbox implement it
 * today; a Drive or Downloads-folder adapter could plug in the same way.
 */
export interface ChoreAdapter {
  readonly kind: 'demo' | 'gmail';
  /** Samples the inbox and groups it by sender. */
  scan(onProgress?: (done: number, total: number) => void): Promise<ScanResult>;
  /** Exact number of unread emails in the inbox right now. */
  unreadCount(): Promise<number>;
  /** All unread inbox message ids from one sender. */
  idsForSender(sender: string): Promise<string[]>;
  /**
   * Applies an action. Banish marks read and archives, tagging every message
   * with the run label so it can be undone. Nothing is ever deleted.
   */
  apply(action: MailAction, ids: readonly string[], runId: string): Promise<void>;
  /** Restores everything banished in a run and removes filters it created. */
  undo(runId: string): Promise<number>;
  /** Asks for any extra permission needed for reply drafts. Call from a user gesture. */
  enableDrafts(): Promise<void>;
  /** Saves a reply draft. */
  createDraft(email: EmailItem, body: string): Promise<void>;
  /** Filters future mail from a sender out of the inbox and unsubscribes when possible. Call from a user gesture. */
  seal(target: SealTarget, runId: string): Promise<SealResult>;
}
