import * as cheerio from 'cheerio';
import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO009';
const VERSION = '1.0.0';

export function checkSEO009(page: PageData): RuleOutput[] {
  if (!page.html || page.httpStatus === null || page.httpStatus >= 400) return [];
  const $ = cheerio.load(page.html);
  const blocks = $('script[type="application/ld+json"]').toArray();
  if (blocks.length === 0) return []; // no JSON-LD — not applicable

  const findings: RuleOutput[] = [];
  blocks.forEach((el, i) => {
    const content = $(el).html() ?? '';
    // occurrence_key uses zero-based block index string so each block has a stable unique identity
    const occurrenceKey = `block_${i}`;
    try {
      JSON.parse(content);
      findings.push({
        rule_id: RULE_ID, rule_version: VERSION,
        result: 'pass', reason_code: 'VALID_JSON_LD',
        severity: 'low', url: page.url,
        occurrence_key: occurrenceKey,
        title: 'Valid JSON-LD syntax',
        description: `JSON-LD block #${i + 1} on ${page.url} is valid.`,
        remediation: '',
        retest_instructions: '',
        evidence: [{ url: page.url, observed_value: `block_${i}: valid`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION }],
      });
    } catch (err) {
      findings.push({
        rule_id: RULE_ID, rule_version: VERSION,
        result: 'fail', reason_code: 'INVALID_JSON_LD',
        severity: 'low', url: page.url,
        occurrence_key: occurrenceKey,
        title: 'Invalid JSON-LD syntax',
        description: `JSON-LD block #${i + 1} on ${page.url}: ${(err as Error).message}`,
        remediation: 'Fix the JSON syntax error in the structured data block.',
        retest_instructions: 'Validate JSON-LD and re-run.',
        evidence: [{ url: page.url, observed_value: `parse_error: ${(err as Error).message}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, excerpt: content.substring(0, 500) }],
      });
    }
  });
  return findings;
}
