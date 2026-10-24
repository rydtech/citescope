import { NextRequest } from 'next/server';

/**
 * In-memory rate limiter shared across auth routes within a single process.
 *
 * Limitations acknowledged:
 * - In-process only: multiple Next.js workers do not share state. A Redis-backed
 *   store (e.g. ioredis + sliding window) is required for multi-instance enforcement.
 * - Map size is bounded to prevent unbounded memory growth from spoofed keys.
 *
 * IP source:
 * - Uses req.ip (Next.js connection IP) when available — this is not spoofable.
 * - Falls back to the first X-Forwarded-For value only when TRUSTED_PROXY=true
 *   is explicitly set, acknowledging that a trusted proxy overwrites the header.
 * - When neither is available, all requests fall into a shared 'unknown' bucket.
 */

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
// Evict expired entries when the map exceeds this size to bound memory use.
const MAX_ENTRIES = 10_000;

const TRUSTED_PROXY = process.env.TRUSTED_PROXY === 'true';

// Shared across login and signup route modules within the same process.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(req: NextRequest): string {
  // req.ip is populated by Next.js from the actual TCP connection; not spoofable.
  if (req.ip) return req.ip;

  // Only trust the X-Forwarded-For header when a trusted proxy is explicitly configured.
  if (TRUSTED_PROXY) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]!.trim();
  }

  // No reliable IP available — bucket all unknown clients together.
  // This is conservative: unknown clients share a single rate limit.
  return 'unknown';
}

function evictExpired(now: number): void {
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

export function checkRateLimit(key: string): boolean {
  const now = Date.now();

  if (rateLimitMap.size >= MAX_ENTRIES) {
    evictExpired(now);
  }

  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}
