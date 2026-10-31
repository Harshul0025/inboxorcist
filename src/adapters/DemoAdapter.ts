import { DEMO_LATENCY_MS, SCAN_SAMPLE_SIZE } from '../../shared/constants';
import type { EmailItem } from '../../shared/types';
import { sleep } from '../lib/async';
import { groupBySender } from '../lib/grouping';
import { generateDemoInbox } from './demoInbox';
import type { ChoreAdapter, MailAction, ScanResult, SealResult, SealTarget } from './types';

interface DemoMessage {
  email: EmailItem;
  labels: Set<string>;
}

export interface DemoAdapterOptions {
  emails?: EmailItem[];
  latencyMs?: number;
}

/**
 * Offline, in-memory inbox with the same behaviour as the Gmail adapter.
 * It powers the zero-setup demo and makes the whole game testable.
 */
export class DemoAdapter implements ChoreAdapter {
  readonly kind = 'demo';
  private readonly messages: Map<string, DemoMessage>;
  private readonly latencyMs: number;
  private readonly filters = new Map<string, string[]>();
  readonly drafts: { to: string; body: string }[] = [];
  readonly unsubscribed: string[] = [];

  constructor(options: DemoAdapterOptions = {}) {
    const emails = options.emails ?? generateDemoInbox();
    this.latencyMs = options.latencyMs ?? DEMO_LATENCY_MS;
    this.messages = new Map(emails.map((email) => [email.id, { email, labels: new Set(['INBOX', 'UNREAD']) }]));
  }

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) await sleep(this.latencyMs);
  }

  private unreadInbox(): DemoMessage[] {
    return [...this.messages.values()].filter((m) => m.labels.has('INBOX') && m.labels.has('UNREAD'));
  }

  /** Senders currently filtered out of the inbox for a run. */
  filtersFor(runId: string): readonly string[] {
    return this.filters.get(runId) ?? [];
  }

  async scan(onProgress?: (done: number, total: number) => void): Promise<ScanResult> {
    await this.delay();
    const unread = this.unreadInbox();
    const emails = unread.slice(0, SCAN_SAMPLE_SIZE).map((m) => m.email);
    onProgress?.(emails.length, emails.length);
    return { totalUnread: unread.length, emails, groups: groupBySender(emails) };
  }

  async unreadCount(): Promise<number> {
    return Promise.resolve(this.unreadInbox().length);
  }

  async idsForSender(sender: string): Promise<string[]> {
    await this.delay();
    return this.unreadInbox()
      .filter((m) => m.email.senderEmail === sender)
      .map((m) => m.email.id);
  }

  async apply(action: MailAction, ids: readonly string[], runId: string): Promise<void> {
    await this.delay();
    for (const id of ids) {
      const message = this.messages.get(id);
      if (!message) continue;
      if (action === 'banish') {
        message.labels.delete('INBOX');
        message.labels.delete('UNREAD');
        message.labels.add(`run:${runId}`);
      } else {
        message.labels.add('STARRED');
        message.labels.add('NEEDS_REPLY');
      }
    }
  }

  async undo(runId: string): Promise<number> {
    await this.delay();
    let restored = 0;
    for (const message of this.messages.values()) {
      if (message.labels.delete(`run:${runId}`)) {
        message.labels.add('INBOX');
        message.labels.add('UNREAD');
        restored += 1;
      }
    }
    this.filters.delete(runId);
    return restored;
  }

  async enableDrafts(): Promise<void> {
    return Promise.resolve();
  }

  async createDraft(email: EmailItem, body: string): Promise<void> {
    await this.delay();
    this.drafts.push({ to: email.senderEmail, body });
  }

  async seal(target: SealTarget, runId: string): Promise<SealResult> {
    await this.delay();
    this.filters.set(runId, [...this.filtersFor(runId), target.sender]);
    if (target.unsubscribeUrl) this.unsubscribed.push(target.sender);
    return { filtered: true, unsubscribed: Boolean(target.unsubscribeUrl) };
  }
}
