import * as cheerio from 'cheerio';
import type { PageData, RuleOutput } from '../types.js';
const RULE_ID = 'SEO007';
const VERSION = '1.0.0';

export function checkSEO007(pages: PageData[]): RuleOutput[] {
  const titleMap = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.html || page.httpStatus === null || page.httpStatus >= 400) continue;
    const $ = cheerio.load(page.html);
    const title = $('title').text().trim();
    if (title) {
      const existing = titleMap.get(title) ?? [];
      existing.push(page.url);
      titleMap.set(title, existing);
    }
  }

  // Build a set of URLs with duplicate titles
  const duplicateUrls = new Set<string>();
  for (const [, urls] of titleMap) {
    if (urls.length > 1) urls.forEach(u => duplicateUrls.add(u));
  }

  const findings: RuleOutput[] = [];
  for (const [title, urls] of titleMap) {
    if (urls.length > 1) {
      for (const url of urls) {
        findings.push({
          rule_id: RULE_ID, rule_version: VERSION,
          result: 'review', reason_code: 'DUPLICATE_TITLE',
          severity: 'medium', url,
          title: 'Duplicate title across evaluated pages',
          description: `Title "${title}" appears on ${urls.length} pages.`,
          remediation: 'Ensure each page has a unique, descriptive title.',
          retest_instructions: 'Update page titles and re-run.',
          evidence: [{ url, observed_value: `title: "${title}", also_on: ${urls.filter(u => u !== url).join(', ')}`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, selector: 'title' }],
        });
      }
    } else {
      // Unique title — pass
      findings.push({
        rule_id: RULE_ID, rule_version: VERSION,
        result: 'pass', reason_code: 'UNIQUE_TITLE',
        severity: 'medium', url: urls[0]!,
        title: 'Unique title',
        description: `${urls[0]} has a unique title.`,
        remediation: '',
        retest_instructions: '',
        evidence: [{ url: urls[0]!, observed_value: `title: "${title}"`, timestamp: new Date().toISOString(), extraction_mode: 'http', rule_version: VERSION, selector: 'title' }],
      });
    }
  }
  return findings;
}
