import { isIP } from 'node:net';
import dns from 'node:dns/promises';
import dnsCallback from 'node:dns';

const BLOCKED_IP_PATTERNS = [
  // IPv4 private/loopback/link-local
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  // IPv6 loopback
  /^::1$/,
  // IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:hex)
  /^::ffff:/i,
  // Unique local (fc00::/7 — fc** and fd**)
  /^fc[0-9a-f][0-9a-f]:/i,
  /^fd[0-9a-f][0-9a-f]:/i,
  // Link-local IPv6 (fe80::/10 — fe80..feb*)
  /^fe[89ab][0-9a-f]:/i,
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
]);

/**
 * Check if an already-resolved IP address is private/reserved.
 * Used by the custom DNS lookup agent to block rebinding attacks.
 */
export function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(lower)) return true;
  }
  return false;
}

/**
 * Create a custom DNS lookup function that validates resolved addresses
 * before allowing a connection. This pins validation to the actual connection
 * time, preventing DNS rebinding attacks where an IP changes between the
 * pre-flight validateHostNotPrivate check and the actual TCP connection.
 *
 * Honors both the single-address form (options.all falsy) and the all-addresses
 * form (options.all = true). Node v18+ enables autoSelectFamily by default, which
 * requests all: true and expects a LookupAddress[] result — ignoring this contract
 * produces ERR_INVALID_IP_ADDRESS at connection time.
 */
export function makeSafeLookup(): (
  hostname: string,
  options: dnsCallback.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dnsCallback.LookupAddress[], family: number) => void
) => void {
  return (hostname, options, callback) => {
    if ((options as dnsCallback.LookupAllOptions).all) {
      // all: true — Node expects an array of { address, family } objects.
      dnsCallback.lookup(hostname, { all: true }, (err, addresses) => {
        if (err) {
          callback(err, [], 0);
          return;
        }
        for (const { address } of addresses) {
          if (isPrivateAddress(address)) {
            callback(
              Object.assign(new Error(`DNS resolved to private/reserved address: ${address}`), { code: 'EACCES' }),
              [],
              0
            );
            return;
          }
        }
        callback(null, addresses, 0);
      });
    } else {
      // Single-address form — honor the requested family (4, 6, or 0 for any).
      const family = typeof (options as dnsCallback.LookupOneOptions).family === 'number'
        ? (options as dnsCallback.LookupOneOptions).family!
        : 0;
      dnsCallback.lookup(hostname, { family }, (err, address, fam) => {
        if (err) {
          callback(err, '', 0);
          return;
        }
        if (isPrivateAddress(address)) {
          callback(
            Object.assign(new Error(`DNS resolved to private/reserved address: ${address}`), { code: 'EACCES' }),
            '',
            0
          );
          return;
        }
        callback(null, address, fam);
      });
    }
  };
}

export class SSRFViolationError extends Error {
  constructor(public readonly reason: string) {
    super(`SSRF policy violation: ${reason}`);
    this.name = 'SSRFViolationError';
  }
}

export function validateUrlScheme(url: URL): void {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new SSRFViolationError(`Unsupported scheme: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SSRFViolationError('URL must not contain credentials');
  }
}

export async function validateHostNotPrivate(hostname: string): Promise<void> {
  // Strip brackets from bracketed IPv6 addresses like [::1]
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  const lower = bare.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(lower)) {
    throw new SSRFViolationError(`Blocked hostname: ${hostname}`);
  }
  if (isIP(bare)) {
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(lower)) throw new SSRFViolationError(`Private/reserved IP: ${bare}`);
    }
    return;
  }
  let resolved: string;
  try {
    const result = await dns.lookup(bare);
    resolved = result.address;
  } catch (err) {
    // Fail closed: DNS resolution errors are treated as unsafe
    throw new SSRFViolationError(`DNS resolution failed for ${hostname}: ${(err as Error).message}`);
  }
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(resolved.toLowerCase())) {
      throw new SSRFViolationError(`DNS resolved to private IP ${resolved} for ${hostname}`);
    }
  }
}

export function normalizeUrl(rawUrl: string, base?: string): string | null {
  try {
    const url = base ? new URL(rawUrl, base) : new URL(rawUrl);
    url.hash = '';
    validateUrlScheme(url);
    return url.href;
  } catch {
    return null;
  }
}

export function isSameHost(url: string, authorizedHost: string): boolean {
  try {
    return new URL(url).hostname === authorizedHost;
  } catch {
    return false;
  }
}
