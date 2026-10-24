import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, isPathAllowed } from './robots.js';

const ROBOTS_TXT = `
User-agent: *
Disallow: /private/
Disallow: /admin/

User-agent: Googlebot
Disallow: /noGoogle/

Sitemap: https://example.com/sitemap.xml
`;

describe('parseRobotsTxt', () => {
  it('parses disallowed paths for wildcard user-agent', () => {
    const rules = parseRobotsTxt(ROBOTS_TXT, 'citescope-crawler');
    expect(rules.disallowedPaths).toContain('/private/');
    expect(rules.disallowedPaths).toContain('/admin/');
  });

  it('parses sitemap URLs', () => {
    const rules = parseRobotsTxt(ROBOTS_TXT, 'citescope-crawler');
    expect(rules.sitemapUrls).toContain('https://example.com/sitemap.xml');
  });

  it('handles empty robots.txt', () => {
    const rules = parseRobotsTxt('', 'bot');
    expect(rules.disallowedPaths).toHaveLength(0);
    expect(rules.sitemapUrls).toHaveLength(0);
  });

  it('exact agent match takes precedence over wildcard', () => {
    const txt = `
User-agent: *
Disallow: /all-blocked/

User-agent: citescope
Disallow: /citescope-only/
`;
    const rules = parseRobotsTxt(txt, 'citescope');
    expect(rules.disallowedPaths).toContain('/citescope-only/');
    expect(rules.disallowedPaths).not.toContain('/all-blocked/');
  });

  it('parses Allow rules', () => {
    const txt = `
User-agent: *
Disallow: /private/
Allow: /private/public/
`;
    const rules = parseRobotsTxt(txt, 'bot');
    expect(rules.disallowedPaths).toContain('/private/');
    expect(rules.allowedPaths).toContain('/private/public/');
  });

  it('merges rules from two groups with the same user-agent', () => {
    const txt = `
User-agent: citescope
Disallow: /section-a/

User-agent: citescope
Disallow: /section-b/
`;
    const rules = parseRobotsTxt(txt, 'citescope');
    expect(rules.disallowedPaths).toContain('/section-a/');
    expect(rules.disallowedPaths).toContain('/section-b/');
  });

  it('comment line between user-agent and disallow does not break the group', () => {
    const txt = `User-agent: *
# This is a comment between directives
Disallow: /private/
`;
    const rules = parseRobotsTxt(txt, 'citescope-crawler');
    expect(rules.disallowedPaths).toContain('/private/');
  });

  it('blank line correctly separates two agent groups', () => {
    const txt = `User-agent: *
Disallow: /all-blocked/

User-agent: citescope
Disallow: /citescope-only/
`;
    // citescope should only see its own group, not the wildcard group
    const rules = parseRobotsTxt(txt, 'citescope');
    expect(rules.disallowedPaths).toContain('/citescope-only/');
    expect(rules.disallowedPaths).not.toContain('/all-blocked/');
  });

  it('sitemap outside group is collected', () => {
    const txt = `
User-agent: *
Disallow: /secret/

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap2.xml
`;
    const rules = parseRobotsTxt(txt, 'bot');
    expect(rules.sitemapUrls).toContain('https://example.com/sitemap.xml');
    expect(rules.sitemapUrls).toContain('https://example.com/sitemap2.xml');
  });
});

describe('isPathAllowed', () => {
  it('allows path not in disallowed list', () => {
    expect(isPathAllowed('/public/page', ['/private/', '/admin/'])).toBe(true);
  });

  it('blocks path matching disallowed prefix', () => {
    expect(isPathAllowed('/private/data', ['/private/', '/admin/'])).toBe(false);
  });

  it('allows root when disallowed list is empty', () => {
    expect(isPathAllowed('/', [])).toBe(true);
  });

  it('Allow overrides Disallow when Allow is more specific (longer match)', () => {
    expect(isPathAllowed('/private/public/page', ['/private/'], ['/private/public/'])).toBe(true);
  });

  it('wildcard * matches any sequence', () => {
    expect(isPathAllowed('/articles/2024/my-post', ['/articles/*/'])).toBe(false);
  });

  it('end anchor $ requires path to end exactly', () => {
    // /page$ only matches /page exactly
    // Allow /page$ means /page is explicitly allowed
    expect(isPathAllowed('/page', [], ['/page$'])).toBe(true);
    // Disallow /page$ means /page is blocked but /page/sub is NOT ($ anchors the end)
    expect(isPathAllowed('/page', ['/page$'])).toBe(false);
    expect(isPathAllowed('/page/sub', ['/page$'])).toBe(true);
  });

  it('Disallow: / blocks all', () => {
    expect(isPathAllowed('/anything', ['/'])).toBe(false);
  });

  it('empty Disallow (empty string) is ignored', () => {
    // empty disallow means allow all
    expect(isPathAllowed('/page', [''])).toBe(true);
  });
});
