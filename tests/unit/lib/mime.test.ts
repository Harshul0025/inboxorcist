import { describe, expect, it } from 'vitest';
import { buildReplyMessage, encodeHeader, stripNewlines, toBase64Url } from '../../../src/lib/mime';

function decode(base64url: string): string {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

describe('mime helpers', () => {
  it('strips header-injection newlines', () => {
    expect(stripNewlines('a\r\nBcc: evil@x.com')).toBe('a Bcc: evil@x.com');
  });

  it('encodes base64url without padding', () => {
    const encoded = toBase64Url('hello?>>');
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decode(encoded)).toBe('hello?>>');
  });

  it('RFC 2047-encodes non-ASCII headers only', () => {
    expect(encodeHeader('Hello')).toBe('Hello');
    expect(encodeHeader('नमस्ते')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
  });

  it('builds a threaded reply with a single Re: prefix', () => {
    const raw = buildReplyMessage({ to: 'riya@gmail.com', subject: 'Meet?', body: 'Yes\nsure', inReplyTo: '<id@x>' });
    const message = decode(raw);
    expect(message).toContain('To: riya@gmail.com');
    expect(message).toContain('Subject: Re: Meet?');
    expect(message).toContain('In-Reply-To: <id@x>');
    expect(message).toContain('References: <id@x>');
    expect(message).toContain('Yes\r\nsure');
    expect(decode(buildReplyMessage({ to: 'a@b.co', subject: 'RE: Old', body: '' }))).toContain('Subject: RE: Old');
  });

  it('cannot be tricked into adding headers', () => {
    const message = decode(buildReplyMessage({ to: 'a@b.co\r\nBcc: x@y.z', subject: 'Hi\nBcc: x@y.z', body: '' }));
    expect(message.split('\r\n\r\n')[0]).not.toMatch(/^Bcc:/m);
  });
});
