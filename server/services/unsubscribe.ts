import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import { UNSUBSCRIBE_TIMEOUT_MS } from '../../shared/constants.js';

/** Thrown when a URL is not allowed to be fetched (SSRF protection). */
export class UnsafeUrlError extends Error {
  override name = 'UnsafeUrlError';
}

const blockList = new net.BlockList();
const BLOCKED_V4: readonly [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const BLOCKED_V6: readonly [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];
for (const [address, prefix] of BLOCKED_V4) blockList.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of BLOCKED_V6) blockList.addSubnet(address, prefix, 'ipv6');

/**
 * True when an IP address is private, loopback, link-local, reserved or
 * otherwise not a public internet address.
 * @param address IPv4 or IPv6 literal.
 */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blockList.check(address, 'ipv4');
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped?.[1]) return blockList.check(mapped[1], 'ipv4');
    return blockList.check(address, 'ipv6');
  }
  return true;
}

/**
 * Parses and validates an unsubscribe URL: HTTPS only, default port, no
 * credentials, and no IP literal pointing at a private network.
 * @param raw URL taken from a List-Unsubscribe header.
 */
export function parseSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (url.protocol !== 'https:') throw new UnsafeUrlError('Only https URLs are allowed');
  if (url.username || url.password) throw new UnsafeUrlError('Credentials are not allowed');
  if (url.port && url.port !== '443') throw new UnsafeUrlError('Only the default port is allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('Internal hosts are not allowed');
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError('Private addresses are not allowed');
  return url;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string, family: number) => void;
export type LookupFn = (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => void;

/**
 * Wraps a DNS lookup so every resolved address is checked at connect time.
 * Validating inside the lookup closes the DNS-rebinding gap between
 * "check" and "connect".
 * @param lookup Underlying resolver, defaults to `dns.lookup`.
 */
export function createSafeLookup(lookup: LookupFn = dns.lookup as unknown as LookupFn): LookupFn {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: false }, (error, address, family) => {
      if (error) {
        callback(error, address, family);
        return;
      }
      if (isPrivateAddress(address)) {
        callback(
          Object.assign(new UnsafeUrlError('Resolved to a private address'), { code: 'EUNSAFE' }),
          address,
          family,
        );
        return;
      }
      callback(null, address, family);
    });
  };
}

export type OneClickPoster = (url: string) => Promise<number>;

/**
 * Sends an RFC 8058 one-click unsubscribe POST. Redirects are not followed
 * and the request is aborted after a short timeout.
 * @param lookup DNS resolver (injectable for tests).
 * @param timeoutMs Request timeout.
 * @returns A poster that resolves with the HTTP status code.
 */
export function createOneClickPoster(
  lookup: LookupFn = createSafeLookup(),
  timeoutMs: number = UNSUBSCRIBE_TIMEOUT_MS,
): OneClickPoster {
  return (raw) =>
    new Promise<number>((resolve, reject) => {
      const url = parseSafeUrl(raw);
      const body = 'List-Unsubscribe=One-Click';
      const request = https.request(
        url,
        {
          method: 'POST',
          lookup,
          timeout: timeoutMs,
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': Buffer.byteLength(body),
            'user-agent': 'Inboxorcist/1.0 (+one-click-unsubscribe)',
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      request.on('timeout', () => request.destroy(new Error('Unsubscribe request timed out')));
      request.on('error', reject);
      request.end(body);
    });
}
