import * as cheerio from 'cheerio';
import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO008';
const VERSION = '1.0.0';

export function checkSEO008(page: PageData): RuleOutput | null {
  if (!page.html || page.httpStatus === null || page.httpStatus >= 400) return null;
  const $ = cheerio.load(page.html);
  const canonicals = $('link[rel="canonical"]').map((_, el) => $(el).attr('href')).get().filter(Boolean) as string[];

  if (canonicals.length === 0) return null; // missing canonical is advisory only

  const unique = [...new Set(canonicals)];
  if (unique.length > 1) {
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'fail', reason_code: 'CONFLICTING_CANONICALS',
      severity: 'medium', url: page.url,
      title: 'Conflicting canonical declarations',
      description: `${page.url} has ${unique.length} different canonical URLs: ${unique.join(', ')}`,
      remediation: 'Keep exactly one canonical link element per page.',
      retest_instructions: 'Remove duplicate canonicals and re-run.',
      evidence: [{ url: page.url, observed_value: `canonicals: [${unique.join(', ')}]`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, selector: 'link[rel="canonical"]' }],
    };
  }
  return {
    rule_id: RULE_ID, rule_version: VERSION,
    result: 'pass', reason_code: 'CANONICAL_OK',
    severity: 'medium', url: page.url,
    title: 'Canonical declaration is consistent',
    description: `${page.url} has a single canonical: ${unique[0]}`,
    remediation: '',
    retest_instructions: '',
    evidence: [{ url: page.url, observed_value: `canonical: ${unique[0]}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, selector: 'link[rel="canonical"]' }],
  };
}
