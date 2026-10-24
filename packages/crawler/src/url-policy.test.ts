import { describe, it, expect, vi, afterEach } from 'vitest';
import dnsCallback from 'node:dns';
import { validateUrlScheme, normalizeUrl, isSameHost, validateHostNotPrivate, isPrivateAddress, makeSafeLookup, SSRFViolationError } from './url-policy.js';

describe('validateUrlScheme', () => {
  it('allows http and https', () => {
    expect(() => validateUrlScheme(new URL('http://example.com'))).not.toThrow();
    expect(() => validateUrlScheme(new URL('https://example.com'))).not.toThrow();
  });

  it('rejects unsupported schemes', () => {
    expect(() => validateUrlScheme(new URL('ftp://example.com'))).toThrow(SSRFViolationError);
    expect(() => validateUrlScheme(new URL('file:///etc/passwd'))).toThrow(SSRFViolationError);
  });

  it('rejects URLs with credentials', () => {
    expect(() => validateUrlScheme(new URL('http://user:pass@example.com'))).toThrow(SSRFViolationError);
  });
});

describe('normalizeUrl', () => {
  it('removes fragment', () => {
    expect(normalizeUrl('http://example.com/page#section')).toBe('http://example.com/page');
  });

  it('resolves relative URLs with base', () => {
    expect(normalizeUrl('/about', 'http://example.com/')).toBe('http://example.com/about');
  });

  it('returns null for invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBeNull();
  });

  it('returns null for ftp scheme', () => {
    expect(normalizeUrl('ftp://example.com')).toBeNull();
  });
});

describe('validateHostNotPrivate', () => {
  it('blocks IPv6 loopback ::1', async () => {
    await expect(validateHostNotPrivate('::1')).rejects.toThrow(SSRFViolationError);
  });

  it('blocks bracketed IPv6 loopback [::1]', async () => {
    await expect(validateHostNotPrivate('[::1]')).rejects.toThrow(SSRFViolationError);
  });

  it('blocks IPv4-mapped IPv6 ::ffff:127.0.0.1', async () => {
    await expect(validateHostNotPrivate('::ffff:127.0.0.1')).rejects.toThrow(SSRFViolationError);
  });

  it('blocks unique-local IPv6 fc00::1', async () => {
    await expect(validateHostNotPrivate('fc00::1')).rejects.toThrow(SSRFViolationError);
  });

  it('blocks unique-local IPv6 fd00::1', async () => {
    await expect(validateHostNotPrivate('fd00::1')).rejects.toThrow(SSRFViolationError);
  });

  it('blocks link-local IPv6 fe80::1', async () => {
    await expect(validateHostNotPrivate('fe80::1')).rejects.toThrow(SSRFViolationError);
  });

  it('blocks localhost hostname', async () => {
    await expect(validateHostNotPrivate('localhost')).rejects.toThrow(SSRFViolationError);
  });

  it('blocks 127.0.0.1', async () => {
    await expect(validateHostNotPrivate('127.0.0.1')).rejects.toThrow(SSRFViolationError);
  });
});

describe('isPrivateAddress', () => {
  it('detects IPv4 loopback', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
  });

  it('detects IPv4 private range 10.x', () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true);
  });

  it('detects IPv4 private range 192.168.x', () => {
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
  });

  it('detects IPv6 loopback', () => {
    expect(isPrivateAddress('::1')).toBe(true);
  });

  it('returns false for public IPs', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });
});

describe('makeSafeLookup (DNS rebinding protection)', () => {
  afterEach(() => vi.restoreAllMocks());

  function spyLookup(
    impl: (
      hostname: string,
      opts: dnsCallback.LookupOptions,
      cb: (err: NodeJS.ErrnoException | null, address: string | dnsCallback.LookupAddress[], family: number) => void
    ) => void
  ) {
    // dnsCallback is the dns module object; its lookup property is writable in Node CJS.
    return vi.spyOn(dnsCallback, 'lookup').mockImplementation(impl as never);
  }

  // --- single-address form (all: false / default) ---

  it('passes a public IPv4 address through (single-address form)', () =>
    new Promise<void>((resolve, reject) => {
      spyLookup((_host, _opts, cb) => cb(null, '93.184.216.34', 4));
      const safeLookup = makeSafeLookup();
      safeLookup('example.com', {}, (err, address, family) => {
        try {
          expect(err).toBeNull();
          expect(address).toBe('93.184.216.34');
          expect(family).toBe(4);
          resolve();
        } catch (e) { reject(e); }
      });
    }));

  it('blocks a private IPv4 address (single-address form)', () =>
    new Promise<void>((resolve, reject) => {
      spyLookup((_host, _opts, cb) => cb(null, '10.0.0.1', 4));
      const safeLookup = makeSafeLookup();
      safeLookup('internal.example', {}, (err, address, _family) => {
        try {
          expect(err).not.toBeNull();
          expect((err as NodeJS.ErrnoException).code).toBe('EACCES');
          expect(address).toBe('');
          resolve();
        } catch (e) { reject(e); }
      });
    }));

  it('propagates DNS errors (single-address form)', () =>
    new Promise<void>((resolve, reject) => {
      const dnsErr = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }) as NodeJS.ErrnoException;
      spyLookup((_host, _opts, cb) => cb(dnsErr, '', 0));
      const safeLookup = makeSafeLookup();
      safeLookup('nonexistent.example', {}, (err, _address, _family) => {
        try {
          expect(err).toBe(dnsErr);
          resolve();
        } catch (e) { reject(e); }
      });
    }));

  it('honors the requested family option (single-address form)', () =>
    new Promise<void>((resolve, reject) => {
      spyLookup((_host, opts, cb) => {
        expect((opts as dnsCallback.LookupOneOptions).family).toBe(6);
        cb(null, '2606:2800:21f:cb07:6820:80da:af6b:8b2c', 6);
      });
      const safeLookup = makeSafeLookup();
      safeLookup('example.com', { family: 6 }, (err, address, family) => {
        try {
          expect(err).toBeNull();
          expect(family).toBe(6);
          resolve();
        } catch (e) { reject(e); }
      });
    }));

  // --- all-addresses form (all: true, used by Node autoSelectFamily) ---

  it('returns LookupAddress[] for all public addresses (all: true)', () =>
    new Promise<void>((resolve, reject) => {
      const addresses: dnsCallback.LookupAddress[] = [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', family: 6 },
      ];
      spyLookup((_host, opts, cb) => {
        expect((opts as dnsCallback.LookupAllOptions).all).toBe(true);
        cb(null, addresses as never, 0);
      });
      const safeLookup = makeSafeLookup();
      safeLookup('example.com', { all: true }, (err, result, _family) => {
        try {
          expect(err).toBeNull();
          expect(Array.isArray(result)).toBe(true);
          expect(result).toEqual(addresses);
          resolve();
        } catch (e) { reject(e); }
      });
    }));

  it('blocks any private address in the all-addresses result (all: true)', () =>
    new Promise<void>((resolve, reject) => {
      const addresses: dnsCallback.LookupAddress[] = [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.5', family: 4 },  // private — should trigger block
      ];
      spyLookup((_host, _opts, cb) => cb(null, addresses as never, 0));
      const safeLookup = makeSafeLookup();
      safeLookup('mixed.example', { all: true }, (err, result, _family) => {
        try {
          expect(err).not.toBeNull();
          expect((err as NodeJS.ErrnoException).code).toBe('EACCES');
          expect(Array.isArray(result)).toBe(true);
          expect((result as dnsCallback.LookupAddress[]).length).toBe(0);
          resolve();
        } catch (e) { reject(e); }
      });
    }));

  it('propagates DNS errors (all: true)', () =>
    new Promise<void>((resolve, reject) => {
      const dnsErr = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }) as NodeJS.ErrnoException;
      spyLookup((_host, _opts, cb) => cb(dnsErr, [] as never, 0));
      const safeLookup = makeSafeLookup();
      safeLookup('nonexistent.example', { all: true }, (err, _result, _family) => {
        try {
          expect(err).toBe(dnsErr);
          resolve();
        } catch (e) { reject(e); }
      });
    }));
});

describe('isSameHost', () => {
  it('returns true for same hostname', () => {
    expect(isSameHost('https://example.com/page', 'example.com')).toBe(true);
  });

  it('returns false for different hostname', () => {
    expect(isSameHost('https://other.com/page', 'example.com')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isSameHost('not a url', 'example.com')).toBe(false);
  });
});
