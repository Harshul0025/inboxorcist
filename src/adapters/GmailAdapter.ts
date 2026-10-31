import {
  LABEL_ROOT,
  METADATA_CONCURRENCY,
  NEEDS_REPLY_LABEL,
  SCAN_SAMPLE_SIZE,
  UNREAD_QUERY,
} from '../../shared/constants';
import type { EmailItem } from '../../shared/types';
import type { ApiClient } from '../lib/api';
import { mapWithConcurrency } from '../lib/async';
import { groupBySender } from '../lib/grouping';
import { buildReplyMessage } from '../lib/mime';
import type { GmailApi } from './gmailApi';
import { GMAIL_COMPOSE_SCOPE, GMAIL_SETTINGS_SCOPE, type TokenManager } from './googleAuth';
import type { ChoreAdapter, MailAction, ScanResult, SealResult, SealTarget } from './types';

const SAFE_SENDER = /^[^\s"()<>@,;:\\[\]]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/**
 * Builds the Gmail search query for one sender's unread inbox mail.
 * @param sender Email address; anything that is not a plain address is rejected.
 */
export function senderQuery(sender: string): string {
  if (!SAFE_SENDER.test(sender)) throw new Error('Unsupported sender address');
  return `${UNREAD_QUERY} from:(${sender})`;
}

/**
 * Gmail label used to tag everything banished in a run, so the run can be undone.
 * @param runId Run id.
 */
export function runLabelName(runId: string): string {
  return `${LABEL_ROOT}/${runId}`;
}

/**
 * Real Gmail implementation of the chore adapter. Banish = mark read +
 * archive + tag with the run label. Nothing is ever trashed or deleted.
 */
export class GmailAdapter implements ChoreAdapter {
  readonly kind = 'gmail';
  private readonly filtersByRun = new Map<string, string[]>();

  constructor(
    private readonly gmail: GmailApi,
    private readonly tokens: TokenManager,
    private readonly api: ApiClient,
  ) {}

  async scan(onProgress?: (done: number, total: number) => void): Promise<ScanResult> {
    const totalUnread = await this.gmail.unreadCount('INBOX');
    const refs = await this.gmail.listIds({ q: UNREAD_QUERY, max: SCAN_SAMPLE_SIZE });
    onProgress?.(0, refs.length);
    const emails = await mapWithConcurrency(
      refs,
      METADATA_CONCURRENCY,
      (ref) => this.gmail.getMetadata(ref.id),
      onProgress,
    );
    return { totalUnread, emails, groups: groupBySender(emails) };
  }

  unreadCount(): Promise<number> {
    return this.gmail.unreadCount('INBOX');
  }

  async idsForSender(sender: string): Promise<string[]> {
    const refs = await this.gmail.listIds({ q: senderQuery(sender) });
    return refs.map((ref) => ref.id);
  }

  async apply(action: MailAction, ids: readonly string[], runId: string): Promise<void> {
    if (ids.length === 0) return;
    if (action === 'banish') {
      const runLabel = await this.gmail.ensureLabel(runLabelName(runId));
      await this.gmail.batchModify(ids, [runLabel], ['UNREAD', 'INBOX']);
      return;
    }
    const needsReply = await this.gmail.ensureLabel(NEEDS_REPLY_LABEL);
    await this.gmail.batchModify(ids, ['STARRED', needsReply], []);
  }

  async undo(runId: string): Promise<number> {
    const runLabel = await this.gmail.findLabel(runLabelName(runId));
    let restored = 0;
    if (runLabel) {
      const refs = await this.gmail.listIds({ labelIds: [runLabel] });
      const ids = refs.map((ref) => ref.id);
      await this.gmail.batchModify(ids, ['INBOX', 'UNREAD'], [runLabel]);
      restored = ids.length;
    }
    const filters = this.filtersByRun.get(runId) ?? [];
    for (const id of filters) await this.gmail.deleteFilter(id);
    this.filtersByRun.delete(runId);
    return restored;
  }

  async enableDrafts(): Promise<void> {
    await this.tokens.ensureScopes([GMAIL_COMPOSE_SCOPE]);
  }

  async createDraft(email: EmailItem, body: string): Promise<void> {
    await this.tokens.ensureScopes([GMAIL_COMPOSE_SCOPE]);
    const raw = buildReplyMessage({
      to: email.senderEmail,
      subject: email.subject,
      body,
      ...(email.messageIdHeader ? { inReplyTo: email.messageIdHeader } : {}),
    });
    await this.gmail.createDraft(raw, email.threadId);
  }

  async seal(target: SealTarget, runId: string): Promise<SealResult> {
    await this.tokens.ensureScopes([GMAIL_SETTINGS_SCOPE]);
    const filterId = await this.gmail.createFilter(target.sender);
    this.filtersByRun.set(runId, [...(this.filtersByRun.get(runId) ?? []), filterId]);
    const unsubscribed = target.unsubscribeUrl ? await this.api.unsubscribe(target.unsubscribeUrl) : false;
    return { filtered: true, unsubscribed };
  }
}
