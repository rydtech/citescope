import * as cheerio from 'cheerio';
import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO006';
const VERSION = '1.0.0';

export function checkSEO006(page: PageData): RuleOutput | null {
  if (!page.html || page.httpStatus === null || page.httpStatus >= 400) return null;
  const $ = cheerio.load(page.html);
  const titleEl = $('title');
  const titleText = titleEl.text().trim();
  if (titleEl.length === 0 || titleText === '') {
    return {
      rule_id: RULE_ID, rule_version: VERSION,
      result: 'fail', reason_code: titleEl.length === 0 ? 'MISSING_TITLE' : 'EMPTY_TITLE',
      severity: 'medium', url: page.url,
      title: 'Empty or missing title element',
      description: `${page.url} has ${titleEl.length === 0 ? 'no title element' : 'an empty title element'}.`,
      remediation: 'Add a descriptive, unique title element.',
      retest_instructions: 'Add a title and re-run.',
      evidence: [{ url: page.url, observed_value: titleEl.length === 0 ? 'no_title_element' : 'empty_title', timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, selector: 'title' }],
    };
  }
  return {
    rule_id: RULE_ID, rule_version: VERSION,
    result: 'pass', reason_code: 'TITLE_PRESENT',
    severity: 'medium', url: page.url,
    title: 'Title element present',
    description: `${page.url} has a title: "${titleText}".`,
    remediation: '',
    retest_instructions: '',
    evidence: [{ url: page.url, observed_value: `title: "${titleText}"`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, selector: 'title' }],
  };
}
