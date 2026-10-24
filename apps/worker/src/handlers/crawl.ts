import type { Job } from 'bullmq';
import * as cheerio from 'cheerio';
import { getDb, updateAuditRunState, transitionAuditToRunning, reconcileAuditCounters, incrementAuditCounter, insertPage, createEvidenceArtifact, insertPageExtraction } from '@citescope/database';
import { fetchPage, extractLinks, isSameHost, parseRobotsTxt, isPathAllowed } from '@citescope/crawler';
import { logger } from '../logger.js';
import { rulesQueue } from '../queue.js';
import { CrawlJobPayloadSchema } from '@citescope/contracts';

const CRAWL_USER_AGENT = 'CiteScope-Crawler/1.0';
const CONCURRENCY = 2;
const MIN_DELAY_MS = 1000;

export async function handleCrawlJob(job: Job): Promise<void> {
  const payload = CrawlJobPayloadSchema.parse(job.data);
  const { audit_run_id, workspace_id, domain, start_url, max_pages, excluded_paths } = payload;

  logger.info('Crawl job started', { audit_run_id, workspace_id });

  const sql = getDb();

  // Transition to 'running' only if currently in 'queued' state.
  // On a BullMQ retry, the audit may already be in 'running', 'canceled', or another terminal
  // state. Skipping when not in 'queued' prevents clobbering terminal states and avoids
  // resetting state on retries (which would falsely re-open a canceled audit).
  const transitioned = await transitionAuditToRunning(audit_run_id);
  if (!transitioned) {
    // Re-check state: if terminal, skip entirely; if already running, proceed (allow retry to continue)
    const [stateCheck] = await sql`SELECT state FROM audit_runs WHERE id = ${audit_run_id} LIMIT 1`;
    if (stateCheck?.state === 'canceled' || stateCheck?.state === 'failed' || stateCheck?.state === 'completed') {
      logger.info('Crawl job skipped — audit already in terminal state', { audit_run_id, state: stateCheck?.state });
      return;
    }
    logger.info('Crawl job continuing — audit already in running state (retry)', { audit_run_id });
  }

  // Fetch robots.txt
  let robotRules = { disallowedPaths: [] as string[], allowedPaths: [] as string[], sitemapUrls: [] as string[] };
  try {
    const robotsUrl = new URL('/robots.txt', start_url).href;
    const robotsResult = await fetchPage(robotsUrl, { timeoutMs: 10_000 });
    if (robotsResult.html) {
      robotRules = parseRobotsTxt(robotsResult.html, CRAWL_USER_AGENT);
    }
  } catch {
    logger.warn('Could not fetch robots.txt', { audit_run_id });
  }

  const queue = new Set<string>([start_url]);
  const visited = new Set<string>();
  const brokenUrls = new Set<string>();
  // Count all fetch attempts (success or fail) toward budget to prevent budget bypass
  let fetchAttempts = 0;
  // Cap frontier size to prevent memory exhaustion from infinite discovery
  const MAX_FRONTIER_SIZE = max_pages * 10;

  // Process in waves respecting concurrency
  while (queue.size > 0 && fetchAttempts < max_pages) {
    // Check for cancellation
    const runRow = await sql`SELECT state FROM audit_runs WHERE id = ${audit_run_id} LIMIT 1`;
    if (runRow[0]?.state === 'canceled') {
      logger.info('Crawl canceled', { audit_run_id });
      return;
    }

    // Clamp batch to remaining budget so we never over-fetch
    const remaining = max_pages - fetchAttempts;
    const batch = [...queue].slice(0, Math.min(CONCURRENCY, remaining));
    for (const url of batch) {
      queue.delete(url);
      if (visited.has(url)) continue;
      visited.add(url);

      // Check exclusions
      const urlPath = new URL(url).pathname;
      const isExcluded = excluded_paths.some(p => urlPath.startsWith(p));
      if (isExcluded) {
        await incrementAuditCounter(audit_run_id, 'pages_excluded');
        continue;
      }

      // Check robots.txt
      if (!isPathAllowed(urlPath, robotRules.disallowedPaths, robotRules.allowedPaths)) {
        await insertPage({
          workspace_id, audit_run_id,
          requested_url: url, final_url: null,
          http_status: null, content_type: null, content_hash: null,
          redirect_chain: [], robots_directive: 'blocked_by_robots_txt',
          canonical_url: null, title: null, meta_description: null,
          is_rendered: false, fetch_duration_ms: 0, fetch_error: null,
          fetched_at: new Date(),
        });
        await incrementAuditCounter(audit_run_id, 'pages_blocked');
        await incrementAuditCounter(audit_run_id, 'pages_discovered');
        continue;
      }

      await incrementAuditCounter(audit_run_id, 'pages_discovered');

      // Throttle
      await sleep(MIN_DELAY_MS);

      const result = await fetchPage(url, { userAgent: CRAWL_USER_AGENT });

      // Extract title and meta
      let title: string | null = null;
      let metaDescription: string | null = null;
      let canonicalUrl: string | null = null;
      // Extraction fields (full structured data for rules)
      let metaRobots: string | null = null;
      let canonicalUrls: string[] = [];
      let internalLinks: Array<{ href: string }> = [];
      let jsonLdBlocks: string[] = [];

      if (result.html && !result.contentType?.includes('text/plain')) {
        const $ = cheerio.load(result.html);
        title = $('title').text().trim() || null;
        metaDescription = $('meta[name="description"]').attr('content') ?? null;
        metaRobots = $('meta[name="robots"]').attr('content') ?? null;

        // Collect all canonical hrefs
        $('link[rel="canonical"]').each((_, el) => {
          const href = $(el).attr('href');
          if (href) canonicalUrls.push(href);
        });
        canonicalUrl = canonicalUrls[0] ?? null;

        // Collect same-host internal links
        const finalHost = new URL(result.finalUrl).hostname;
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href') ?? '';
          try {
            const resolved = new URL(href, result.finalUrl);
            if (['http:', 'https:'].includes(resolved.protocol) && resolved.hostname === finalHost) {
              resolved.hash = '';
              internalLinks.push({ href: resolved.href });
            }
          } catch { /* skip invalid hrefs */ }
        });

        // Collect all JSON-LD blocks
        $('script[type="application/ld+json"]').each((_, el) => {
          const raw = $(el).html();
          if (raw) jsonLdBlocks.push(raw);
        });
      }

      const page = await insertPage({
        workspace_id, audit_run_id,
        requested_url: url,
        final_url: result.finalUrl,
        http_status: result.httpStatus,
        content_type: result.contentType,
        content_hash: null,
        redirect_chain: result.redirectChain,
        robots_directive: result.robotsDirective,
        canonical_url: canonicalUrl,
        title, meta_description: metaDescription,
        is_rendered: false,
        fetch_duration_ms: result.fetchDurationMs,
        fetch_error: result.fetchError,
        fetched_at: new Date(),
      });

      // Persist extraction record for rule evaluation (avoids synthetic HTML reconstruction)
      if (result.httpStatus !== null && result.httpStatus < 400 && !result.fetchError && !result.contentType?.includes('text/plain')) {
        try {
          await insertPageExtraction({
            page_id: page.id,
            workspace_id,
            audit_run_id,
            extraction_version: '1.0',
            title,
            meta_robots: metaRobots,
            canonical_urls: canonicalUrls,
            internal_links: internalLinks,
            json_ld_blocks: jsonLdBlocks,
            x_robots_tag: result.robotsDirective,
            content_type: result.contentType,
            http_status: result.httpStatus,
          });
        } catch (err) {
          logger.warn('Failed to persist page extraction', { audit_run_id, url, error: String(err) });
        }
      }

      // ALL fetch attempts count toward budget regardless of outcome
      fetchAttempts++;

      if (result.fetchError || (result.httpStatus !== null && result.httpStatus >= 400)) {
        brokenUrls.add(url);
        if (result.httpStatus !== null && result.httpStatus >= 400) {
          // Store evidence
          await createEvidenceArtifact({
            workspace_id, audit_run_id, page_id: page.id,
            artifact_type: 'http_response', storage_ref: null,
            excerpt: `HTTP ${result.httpStatus}`,
            selector: null, content_hash: null,
            extraction_mode: 'http', rule_id: 'SEO001',
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            is_redacted: false,
          });
        }
        await incrementAuditCounter(audit_run_id, result.fetchError ? 'pages_failed' : 'pages_fetched');
      } else {
        await incrementAuditCounter(audit_run_id, 'pages_fetched');

        // Discover links — use final URL's host to handle apex/www redirect correctly
        if (result.html && fetchAttempts < max_pages && queue.size < MAX_FRONTIER_SIZE) {
          const finalHost = new URL(result.finalUrl).hostname;
          const links = extractLinks(result.html, result.finalUrl);
          for (const link of links) {
            if (
              (isSameHost(link, domain) || isSameHost(link, finalHost)) &&
              !visited.has(link) && !queue.has(link) &&
              queue.size < MAX_FRONTIER_SIZE
            ) {
              queue.add(link);
            }
          }
        }
      }
    }
  }

  // Fetch and parse sitemap documents to get page URLs for SEO010
  const sitemapPageUrls = new Set<string>();
  const MAX_SITEMAP_PAGE_URLS = 3000;
  const MAX_CHILD_SITEMAPS = 3;

  for (const sitemapDocUrl of robotRules.sitemapUrls) {
    if (sitemapPageUrls.size >= MAX_SITEMAP_PAGE_URLS) break;
    try {
      const sitemapResult = await fetchPage(sitemapDocUrl, { timeoutMs: 10_000, userAgent: CRAWL_USER_AGENT });
      if (sitemapResult.html) {
        const extracted = parseSitemapXml(sitemapResult.html);
        if (extracted.type === 'urlset') {
          for (const u of extracted.urls.slice(0, MAX_SITEMAP_PAGE_URLS - sitemapPageUrls.size)) {
            sitemapPageUrls.add(u);
          }
        } else if (extracted.type === 'sitemapindex') {
          let childCount = 0;
          for (const childUrl of extracted.urls) {
            if (childCount >= MAX_CHILD_SITEMAPS || sitemapPageUrls.size >= MAX_SITEMAP_PAGE_URLS) break;
            try {
              const childResult = await fetchPage(childUrl, { timeoutMs: 10_000, userAgent: CRAWL_USER_AGENT });
              if (childResult.html) {
                const childExtracted = parseSitemapXml(childResult.html);
                if (childExtracted.type === 'urlset') {
                  for (const u of childExtracted.urls.slice(0, MAX_SITEMAP_PAGE_URLS - sitemapPageUrls.size)) {
                    sitemapPageUrls.add(u);
                  }
                }
              }
              childCount++;
            } catch { /* skip failed child sitemap */ }
          }
        }
      }
    } catch {
      logger.warn('Could not fetch sitemap', { audit_run_id, sitemapDocUrl });
    }
  }

  // Store broken URLs and sitemap page URLs for rules phase
  await sql`
    UPDATE audit_runs
    SET config_snapshot = config_snapshot || ${sql.json({
      broken_urls: [...brokenUrls],
      sitemap_urls: robotRules.sitemapUrls,
      sitemap_page_urls: [...sitemapPageUrls],
    })}
    WHERE id = ${audit_run_id}
  `;

  // Reconcile page counters from the actual pages table rather than relying on increments.
  // On a BullMQ retry, increments would have been applied multiple times, inflating counters.
  // Reconciling from the DB at the end of each crawl ensures idempotent counter values.
  try {
    await reconcileAuditCounters(audit_run_id);
  } catch (err) {
    logger.warn('Counter reconciliation failed (non-fatal)', { audit_run_id, error: String(err) });
  }

  // Enqueue rules job
  await rulesQueue.add('rules.evaluate', { audit_run_id, workspace_id }, {
    jobId: `rules${audit_run_id.replace(/-/g, '')}`,
  });

  logger.info('Crawl complete, rules job enqueued', { audit_run_id, pages_crawled: fetchAttempts });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse a sitemap XML document.
 * Returns { type: 'urlset', urls } for page sitemaps or
 * { type: 'sitemapindex', urls } for sitemap index files.
 */
function parseSitemapXml(xml: string): { type: 'urlset' | 'sitemapindex' | 'unknown'; urls: string[] } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: string[] = [];

  if ($('urlset').length > 0) {
    $('urlset url loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });
    return { type: 'urlset', urls: urls.slice(0, 1000) };
  } else if ($('sitemapindex').length > 0) {
    $('sitemapindex sitemap loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });
    return { type: 'sitemapindex', urls };
  }
  return { type: 'unknown', urls: [] };
}
