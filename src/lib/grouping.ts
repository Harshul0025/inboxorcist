import { PROPOSE_MAX_GROUPS, PROPOSE_MAX_SAMPLES, TEXT_FIELD_MAX } from '../../shared/constants';
import { cleanText, truncate } from '../../shared/text';
import type { EmailItem, SenderGroup } from '../../shared/types';

export interface ParsedAddress {
  email: string;
  name: string;
}

function localPart(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local.length > 0 ? local : email;
}

/**
 * Parses an RFC 5322 From header such as `"Swiggy" <offers@swiggy.in>`.
 * @param header Raw From header value.
 */
export function parseFromHeader(header: string): ParsedAddress {
  const angle = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(header);
  if (angle) {
    const email = (angle[2] ?? '').trim().toLowerCase();
    const name = cleanText(angle[1] ?? '');
    return { email, name: name.length > 0 ? name : localPart(email) };
  }
  const email = header.trim().toLowerCase();
  return { email, name: localPart(email) };
}

/**
 * Groups emails by sender address, most prolific senders first, keeping a
 * few trimmed samples per sender for Gemini.
 * @param emails Sampled unread emails.
 */
export function groupBySender(emails: readonly EmailItem[]): SenderGroup[] {
  const groups = new Map<string, SenderGroup>();
  for (const email of emails) {
    let group = groups.get(email.senderEmail);
    if (!group) {
      group = { sender: email.senderEmail, senderName: email.senderName, count: 0, samples: [] };
      groups.set(email.senderEmail, group);
    }
    group.count += 1;
    if (group.samples.length < PROPOSE_MAX_SAMPLES) {
      group.samples.push({
        id: email.id,
        subject: truncate(cleanText(email.subject), TEXT_FIELD_MAX),
        snippet: truncate(cleanText(email.snippet), TEXT_FIELD_MAX),
      });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.sender.localeCompare(b.sender))
    .slice(0, PROPOSE_MAX_GROUPS)
    .map((group) => ({ ...group, senderName: truncate(group.senderName, TEXT_FIELD_MAX) }));
}
