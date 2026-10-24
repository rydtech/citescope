import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO001';
const VERSION = '1.0.0';

export function checkSEO001(page: PageData): RuleOutput | null {
  if (page.httpStatus === null && !page.fetchError) return null; // not yet fetched

  if (page.fetchError) {
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'fail', reason_code: 'FETCH_ERROR',
      severity: 'high', url: page.url,
      title: 'Failed fetch of expected public page',
      description: `The page at ${page.url} could not be fetched: ${page.fetchError}`,
      remediation: 'Verify the URL is publicly accessible.',
      retest_instructions: 'Re-run audit after fixing the server-side issue.',
      evidence: [{ url: page.url, observed_value: `fetch_error: ${page.fetchError}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
    };
  }
  if (page.httpStatus !== null && page.httpStatus >= 400) {
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'fail', reason_code: `HTTP_${page.httpStatus}`,
      severity: page.httpStatus >= 500 ? 'high' : 'medium',
      url: page.url,
      title: 'Failed fetch of expected public page',
      description: `The page at ${page.url} returned HTTP ${page.httpStatus}.`,
      remediation: 'Restore the page or implement a proper redirect.',
      retest_instructions: 'Re-run after the page is accessible.',
      evidence: [{ url: page.url, observed_value: `http_status: ${page.httpStatus}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
    };
  }
  return {
    rule_id: RULE_ID, rule_version: VERSION,
    result: 'pass', reason_code: 'FETCH_OK',
    severity: 'high', url: page.url,
    title: 'Page fetched successfully',
    description: `${page.url} returned HTTP ${page.httpStatus}.`,
    remediation: '',
    retest_instructions: '',
    evidence: [{ url: page.url, observed_value: `http_status: ${page.httpStatus}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
  };
}
