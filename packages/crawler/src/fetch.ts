import * as https from 'node:https';
import * as http from 'node:http';
import * as cheerio from 'cheerio';
import { validateUrlScheme, validateHostNotPrivate, makeSafeLookup } from './url-policy.js';

// Shared agents with custom DNS lookup that validates resolved IPs at connection time.
// This prevents DNS rebinding: even if the IP changes between pre-flight validation
// and the actual TCP connection, the agent's lookup function will still block private IPs.
const safeLookup = makeSafeLookup();
const safeHttpsAgent = new https.Agent({ lookup: safeLookup as never });
const safeHttpAgent = new http.Agent({ lookup: safeLookup as never });

export interface FetchResult {
  url: string;
  finalUrl: string;
  httpStatus: number | null;
  contentType: string | null;
  html: string | null;
  redirectChain: string[];
  robotsDirective: string | null;
  fetchError: string | null;
  fetchDurationMs: number;
}

const DEFAULT_UA = 'CiteScope-Crawler/1.0 (+https://citescope.app/crawler)';
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

export async function fetchPage(rawUrl: string, opts: {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  maxRedirects?: number;
} = {}): Promise<FetchResult> {
  const startMs = Date.now();
  const { timeoutMs = DEFAULT_TIMEOUT, maxBytes = DEFAULT_MAX_BYTES, userAgent = DEFAULT_UA, maxRedirects = DEFAULT_MAX_REDIRECTS } = opts;
  const redirectChain: string[] = [];
  let currentUrl = rawUrl;

  try {
    const parsed = new URL(currentUrl);
    validateUrlScheme(parsed);
    await validateHostNotPrivate(parsed.hostname);

    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (hop > 0) redirectChain.push(currentUrl);
      const result = await singleFetch(currentUrl, userAgent, timeoutMs, maxBytes);

      if (result.status >= 300 && result.status < 400 && result.location) {
        if (hop === maxRedirects) {
          return { url: rawUrl, finalUrl: currentUrl, httpStatus: result.status, contentType: null, html: null, redirectChain, robotsDirective: null, fetchError: `REDIRECT_LIMIT_EXCEEDED`, fetchDurationMs: Date.now() - startMs };
        }
        const nextUrl = new URL(result.location, currentUrl).href;
        const nextParsed = new URL(nextUrl);
        validateUrlScheme(nextParsed);
        await validateHostNotPrivate(nextParsed.hostname);
        currentUrl = nextUrl;
        continue;
      }

      const contentType = result.headers['content-type'] ?? null;
      const robotsDirective = result.headers['x-robots-tag'] ?? null;
      const isHtml = contentType?.includes('text/html') ?? false;
      const isText = contentType?.includes('text/plain') ?? false;
      // Also retain bodies for XML sitemaps (application/xml, text/xml) so sitemap
      // fetches in crawl.ts can access the response body via result.html.
      const isXml = (contentType?.includes('application/xml') || contentType?.includes('text/xml')) ?? false;

      return {
        url: rawUrl, finalUrl: currentUrl, httpStatus: result.status,
        contentType, html: (isHtml || isText || isXml) && result.body ? result.body : null,
        redirectChain, robotsDirective, fetchError: null,
        fetchDurationMs: Date.now() - startMs,
      };
    }
    throw new Error('Redirect loop');
  } catch (err) {
    return { url: rawUrl, finalUrl: currentUrl, httpStatus: null, contentType: null, html: null, redirectChain, robotsDirective: null, fetchError: (err as Error).message, fetchDurationMs: Date.now() - startMs };
  }
}

function singleFetch(url: string, userAgent: string, timeoutMs: number, maxBytes: number): Promise<{ status: number; headers: Record<string, string>; body: string | null; location: string | null }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const lib = isHttps ? https : http;
    const agent = isHttps ? safeHttpsAgent : safeHttpAgent;
    const req = lib.request(url, { method: 'GET', agent, headers: { 'User-Agent': userAgent, Accept: 'text/html,*/*;q=0.8' }, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let truncated = false;
      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) { truncated = true; req.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          headers[k.toLowerCase()] = Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
        }
        resolve({ status: res.statusCode ?? 0, headers, body: truncated ? null : Buffer.concat(chunks).toString('utf8'), location: headers['location'] ?? null });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    try {
      const resolved = new URL(href, baseUrl);
      if (['http:', 'https:'].includes(resolved.protocol)) {
        resolved.hash = '';
        links.push(resolved.href);
      }
    } catch { /* skip */ }
  });
  return [...new Set(links)];
}
