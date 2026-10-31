/**
 * Removes CR/LF so untrusted values cannot inject extra MIME headers.
 * @param value Header value.
 */
export function stripNewlines(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Base64url-encodes UTF-8 text, as required by the Gmail API `raw` field.
 * @param text Any Unicode text.
 */
export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Encodes a header value with RFC 2047 when it contains non-ASCII text.
 * @param value Header value.
 */
export function encodeHeader(value: string): string {
  const clean = stripNewlines(value);
  if (/^[ -~]*$/.test(clean)) return clean;
  const bytes = new TextEncoder().encode(clean);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

export interface ReplyDraft {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}

/**
 * Builds a base64url RFC 2822 message for `users.drafts.create`.
 * @param draft Reply fields; all header values are sanitised.
 */
export function buildReplyMessage(draft: ReplyDraft): string {
  const subject = /^re:/i.test(draft.subject) ? draft.subject : `Re: ${draft.subject}`;
  const headers = [
    `To: ${stripNewlines(draft.to)}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (draft.inReplyTo) {
    const id = stripNewlines(draft.inReplyTo);
    headers.push(`In-Reply-To: ${id}`, `References: ${id}`);
  }
  return toBase64Url(`${headers.join('\r\n')}\r\n\r\n${draft.body.replace(/\r?\n/g, '\r\n')}`);
}
