import * as cheerio from 'cheerio';
import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO002';
const VERSION = '1.0.0';

/**
 * SEO002 — Broken internal links.
 *
 * For each internal link on the page:
 *   - If the target is in brokenTargets → fail (BROKEN_INTERNAL_LINK)
 *   - If the target is in visitedTargets and not broken → pass (REACHABLE_LINK)
 *   - If the target was never visited (budget ran out) → unknown (UNVISITED_TARGET)
 *
 * occurrence_key is set to the resolved target URL so that multiple findings
 * on the same page (same rule_id + url) can each have a stable unique identity.
 */
export function checkSEO002(
  page: PageData,
  brokenTargets: Set<string>,
  visitedTargets: Set<string> = new Set(),
): RuleOutput[] {
  if (!page.html || !page.finalUrl) return [];
  const $ = cheerio.load(page.html);
  const baseHost = new URL(page.finalUrl).hostname;
  const findings: RuleOutput[] = [];
  let internalLinkCount = 0;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    try {
      const resolved = new URL(href, page.finalUrl!);
      if (resolved.hostname !== baseHost) return;
      internalLinkCount++;
      const targetUrl = resolved.href;

      if (brokenTargets.has(targetUrl)) {
        findings.push({
          rule_id: RULE_ID, rule_version: VERSION,
          result: 'fail', reason_code: 'BROKEN_INTERNAL_LINK',
          severity: 'medium', url: page.url,
          occurrence_key: targetUrl,
          title: 'Broken internal link target',
          description: `Link to ${targetUrl} from ${page.url} is broken.`,
          remediation: 'Fix or remove the broken link.',
          retest_instructions: 'Re-run after fixing the link target.',
          evidence: [{ url: page.url, observed_value: `broken_link: ${targetUrl}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, excerpt: $.html(el)?.substring(0, 300) }],
        });
      } else if (visitedTargets.has(targetUrl)) {
        // Confirmed reachable (visited and not broken)
        findings.push({
          rule_id: RULE_ID, rule_version: VERSION,
          result: 'pass', reason_code: 'REACHABLE_LINK',
          severity: 'medium', url: page.url,
          occurrence_key: targetUrl,
          title: 'Internal link target is reachable',
          description: `Link to ${targetUrl} from ${page.url} is reachable.`,
          remediation: '',
          retest_instructions: '',
          evidence: [{ url: page.url, observed_value: `reachable_link: ${targetUrl}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
        });
      } else {
        // Target was never visited (budget ran out or not discovered)
        findings.push({
          rule_id: RULE_ID, rule_version: VERSION,
          result: 'unknown', reason_code: 'UNVISITED_TARGET',
          severity: 'medium', url: page.url,
          occurrence_key: targetUrl,
          title: 'Internal link target not assessed',
          description: `Link to ${targetUrl} from ${page.url} was not fetched within the crawl budget.`,
          remediation: 'Increase crawl budget or manually verify the target.',
          retest_instructions: 'Re-run with a larger page budget to assess this link.',
          evidence: [{ url: page.url, observed_value: `unvisited_link: ${targetUrl}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
        });
      }
    } catch { /* skip unparseable hrefs */ }
  });

  if (internalLinkCount === 0) return []; // nothing to check — not applicable
  return findings;
}
