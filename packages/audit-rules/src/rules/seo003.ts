import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO003';
const VERSION = '1.0.0';
const MAX_REDIRECTS = 5;

export function checkSEO003(page: PageData): RuleOutput | null {
  if (page.httpStatus === null && !page.fetchError) return null; // not yet fetched

  // Check fetch error for redirect limit exceeded — this happens when the fetcher
  // stops at maxRedirects; the traversal is exhausted so it must be treated as a fail.
  if (page.fetchError === 'REDIRECT_LIMIT_EXCEEDED') {
    const chain = page.redirectChain;
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'fail', reason_code: 'REDIRECT_LIMIT_EXCEEDED',
      severity: 'high', url: page.url,
      title: 'Redirect limit exceeded',
      description: `${page.url} exceeded the maximum redirect budget (${MAX_REDIRECTS}).`,
      remediation: 'Consolidate redirect chains to a single hop.',
      retest_instructions: 'Re-run after reducing redirect chain length.',
      evidence: [{ url: page.url, observed_value: `redirect_chain: ${chain.join(' -> ')} (limit: ${MAX_REDIRECTS})`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
    };
  }

  const chain = page.redirectChain;
  const seen = new Set<string>();
  for (const url of chain) {
    if (seen.has(url)) {
      return {
        rule_id: RULE_ID, rule_version: VERSION,
        result: 'fail', reason_code: 'REDIRECT_LOOP',
        severity: 'high', url: page.url,
        title: 'Redirect loop detected',
        description: `A redirect loop was detected at ${page.url}.`,
        remediation: 'Fix the circular redirect in server routing.',
        retest_instructions: 'Re-run after fixing the redirect chain.',
        evidence: [{ url: page.url, observed_value: `redirect_chain: ${chain.join(' -> ')}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
      };
    }
    seen.add(url);
  }
  if (chain.length > MAX_REDIRECTS) {
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'fail', reason_code: 'EXCESSIVE_REDIRECTS',
      severity: 'medium', url: page.url,
      title: 'Excessive redirect chain',
      description: `${page.url} has ${chain.length} redirects (max: ${MAX_REDIRECTS}).`,
      remediation: 'Consolidate redirect chains to a single hop.',
      retest_instructions: 'Re-run after reducing redirect chain length.',
      evidence: [{ url: page.url, observed_value: `redirect_count: ${chain.length}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
    };
  }
  return {
    rule_id: RULE_ID, rule_version: VERSION,
    result: 'pass', reason_code: 'REDIRECT_OK',
    severity: 'high', url: page.url,
    title: 'No redirect issues',
    description: chain.length === 0
      ? `${page.url} loaded without redirects.`
      : `${page.url} redirected ${chain.length} time(s) within the allowed budget.`,
    remediation: '',
    retest_instructions: '',
    evidence: [{ url: page.url, observed_value: `redirect_count: ${chain.length}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
  };
}
