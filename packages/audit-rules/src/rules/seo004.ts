import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO004';
const VERSION = '1.0.0';

export function checkSEO004(page: PageData): RuleOutput | null {
  if (page.robotsDirective === 'blocked_by_robots_txt') {
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'not_applicable', reason_code: 'BLOCKED_BY_ROBOTS_TXT',
      severity: 'low', url: page.url,
      title: 'Crawler denied by robots.txt',
      description: `Crawler was denied access to ${page.url} by robots.txt.`,
      remediation: 'Review whether this exclusion is intentional.',
      retest_instructions: 'Update robots.txt and re-run.',
      evidence: [{ url: page.url, observed_value: 'blocked_by_robots_txt', timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
    };
  }
  if (page.httpStatus === null && !page.fetchError) return null; // not yet fetched
  return {
    rule_id: RULE_ID, rule_version: VERSION,
    result: 'pass', reason_code: 'ROBOTS_ALLOWED',
    severity: 'low', url: page.url,
    title: 'Page allowed by robots policy',
    description: `${page.url} was not blocked by robots.txt.`,
    remediation: '',
    retest_instructions: '',
    evidence: [{ url: page.url, observed_value: 'robots_allowed', timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
  };
}
