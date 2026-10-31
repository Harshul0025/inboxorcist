import { describe, expect, it } from 'vitest';
import {
  createOneClickPoster,
  createSafeLookup,
  isPrivateAddress,
  type LookupFn,
  parseSafeUrl,
  UnsafeUrlError,
} from '../../server/services/unsubscribe';

const resolveTo =
  (address: string, family = 4): LookupFn =>
  (_host, _options, callback) => {
    callback(null, address, family);
  };

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.20.0.1', true],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['::1', true],
    ['fd00::1', true],
    ['fe80::1', true],
    ['::ffff:10.0.0.1', true],
    ['not-an-ip', true],
    ['8.8.8.8', false],
    ['142.250.183.14', false],
    ['2606:4700::1111', false],
    ['::ffff:8.8.8.8', false],
  ])('%s → %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

describe('parseSafeUrl', () => {
  it('accepts public https URLs', () => {
    expect(parseSafeUrl('https://example.com/u?id=1').hostname).toBe('example.com');
    expect(parseSafeUrl('https://example.com:443/u').hostname).toBe('example.com');
  });

  it.each([
    'not a url',
    'http://example.com/u',
    'https://user:pass@example.com/u',
    'https://example.com:8443/u',
    'https://localhost/u',
    'https://metadata.google.internal/u',
    'https://127.0.0.1/u',
    'https://[::1]/u',
  ])('rejects %s', (url) => {
    expect(() => parseSafeUrl(url)).toThrow(UnsafeUrlError);
  });
});

describe('createSafeLookup', () => {
  it('passes public addresses through', async () => {
    const lookup = createSafeLookup(resolveTo('93.184.216.34'));
    await new Promise<void>((resolve) => {
      lookup('example.com', {}, (error, address) => {
        expect(error).toBeNull();
        expect(address).toBe('93.184.216.34');
        resolve();
      });
    });
  });

  it('blocks hosts that resolve to private addresses (DNS rebinding)', async () => {
    const lookup = createSafeLookup(resolveTo('10.0.0.5'));
    await new Promise<void>((resolve) => {
      lookup('rebind.example', {}, (error) => {
        expect(error?.code).toBe('EUNSAFE');
        resolve();
      });
    });
  });

  it('forwards resolver errors', async () => {
    const failing: LookupFn = (_h, _o, callback) => {
      callback(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }), '', 0);
    };
    await new Promise<void>((resolve) => {
      createSafeLookup(failing)('nope.example', {}, (error) => {
        expect(error?.code).toBe('ENOTFOUND');
        resolve();
      });
    });
  });
});

describe('createOneClickPoster', () => {
  it('rejects unsafe URLs before connecting', async () => {
    await expect(createOneClickPoster(resolveTo('8.8.8.8'))('http://example.com')).rejects.toThrow(UnsafeUrlError);
  });

  it('refuses to connect when DNS points inside the network', async () => {
    const poster = createOneClickPoster(createSafeLookup(resolveTo('127.0.0.1')), 1000);
    await expect(poster('https://rebind.example/u')).rejects.toMatchObject({ code: 'EUNSAFE' });
  });
});
