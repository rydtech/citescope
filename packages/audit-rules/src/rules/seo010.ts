import * as cheerio from 'cheerio';
import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO010';
const VERSION = '1.0.0';

export function checkSEO010(page: PageData, isInSitemap: boolean): RuleOutput | null {
  if (!isInSitemap) return null; // not in sitemap — not applicable to this check
  if (!page.html || page.httpStatus === null || page.httpStatus >= 400) return null;
  const $ = cheerio.load(page.html);
  const robotsMeta = $('meta[name="robots"]').attr('content') ?? '';
  const hasNoindex = robotsMeta.toLowerCase().includes('noindex');
  const headerNoindex = (page.robotsDirective ?? '').toLowerCase().includes('noindex');
  if (hasNoindex || headerNoindex) {
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'fail', reason_code: 'SITEMAP_NOINDEX_CONFLICT',
      severity: 'medium', url: page.url,
      title: 'Sitemap-listed URL contradicts search intent',
      description: `${page.url} is in the sitemap but carries a noindex directive.`,
      remediation: 'Remove from sitemap or remove the noindex directive.',
      retest_instructions: 'Resolve the conflict and re-run.',
      evidence: [{ url: page.url, observed_value: `in_sitemap: true, robots_meta: "${robotsMeta}"`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
    };
  }
  return {
    rule_id: RULE_ID, rule_version: VERSION,
    result: 'pass', reason_code: 'SITEMAP_CONSISTENT',
    severity: 'medium', url: page.url,
    title: 'Sitemap-listed URL is indexable',
    description: `${page.url} is in the sitemap and has no noindex directive.`,
    remediation: '',
    retest_instructions: '',
    evidence: [{ url: page.url, observed_value: 'in_sitemap: true, indexable: true', timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
  };
}
