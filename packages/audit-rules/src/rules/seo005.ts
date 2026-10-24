import * as cheerio from 'cheerio';
import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO005';
const VERSION = '1.0.0';

export function checkSEO005(page: PageData): RuleOutput | null {
  if (!page.html || page.httpStatus === null || page.httpStatus >= 400) return null;
  const $ = cheerio.load(page.html);
  const robotsMeta = $('meta[name="robots"]').attr('content') ?? '';
  const hasNoindex = robotsMeta.toLowerCase().includes('noindex');
  const headerNoindex = (page.robotsDirective ?? '').toLowerCase().includes('noindex');
  if (hasNoindex || headerNoindex) {
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'fail', reason_code: 'NOINDEX_DIRECTIVE',
      severity: 'high', url: page.url,
      title: 'Noindex directive on page intended for search',
      description: `${page.url} carries a noindex directive but is not in the exclusion list.`,
      remediation: 'Remove the noindex directive or add to the project exclusion list.',
      retest_instructions: 'Remove the noindex directive and re-run.',
      evidence: [{ url: page.url, observed_value: `robots_meta: "${robotsMeta}", x-robots-tag: "${page.robotsDirective ?? ''}"`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, selector: 'meta[name="robots"]' }],
    };
  }
  return {
    rule_id: RULE_ID, rule_version: VERSION,
    result: 'pass', reason_code: 'INDEXABLE',
    severity: 'high', url: page.url,
    title: 'Page is indexable',
    description: `${page.url} has no noindex directive.`,
    remediation: '',
    retest_instructions: '',
    evidence: [{ url: page.url, observed_value: 'no_noindex', timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
  };
}
