import { describe, it, expect } from 'vitest';
import { checkSEO001 } from './seo001.js';
import { checkSEO002 } from './seo002.js';
import { checkSEO003 } from './seo003.js';
import { checkSEO004 } from './seo004.js';
import { checkSEO005 } from './seo005.js';
import { checkSEO006 } from './seo006.js';
import { checkSEO007 } from './seo007.js';
import { checkSEO008 } from './seo008.js';
import { checkSEO009 } from './seo009.js';
import { checkSEO010 } from './seo010.js';
import type { PageData } from '../types.js';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'http://example.com/',
    finalUrl: 'http://example.com/',
    httpStatus: 200,
    contentType: 'text/html',
    html: '<html><head><title>Test Page</title></head><body></body></html>',
    redirectChain: [],
    robotsDirective: null,
    fetchError: null,
    ...overrides,
  };
}

describe('SEO001 — Failed fetch', () => {
  it('passes for a successful page', () => {
    expect(checkSEO001(makePage())?.result).toBe('pass');
  });

  it('returns null when not yet fetched', () => {
    expect(checkSEO001(makePage({ httpStatus: null, fetchError: null }))).toBeNull();
  });

  it('fails on fetch error', () => {
    const result = checkSEO001(makePage({ fetchError: 'connection refused', httpStatus: null }));
    expect(result?.result).toBe('fail');
    expect(result?.reason_code).toBe('FETCH_ERROR');
    expect(result?.severity).toBe('high');
    expect(result?.evidence).toHaveLength(1);
  });

  it('fails on 404', () => {
    const result = checkSEO001(makePage({ httpStatus: 404, html: null }));
    expect(result?.result).toBe('fail');
    expect(result?.reason_code).toBe('HTTP_404');
    expect(result?.severity).toBe('medium');
  });

  it('fails with high severity on 500', () => {
    const result = checkSEO001(makePage({ httpStatus: 500, html: null }));
    expect(result?.severity).toBe('high');
  });
});

describe('SEO002 — Broken internal links', () => {
  it('returns empty for page with no internal links', () => {
    const page = makePage({ html: '<html><head></head><body><a href="https://other.com">External</a></body></html>' });
    expect(checkSEO002(page, new Set())).toHaveLength(0);
  });

  it('returns unknown for unvisited internal link (not in visitedTargets)', () => {
    const page = makePage({ html: '<html><head></head><body><a href="/about">About</a></body></html>' });
    // Neither broken nor visited — budget ran out
    const results = checkSEO002(page, new Set(), new Set());
    expect(results).toHaveLength(1);
    expect(results[0]?.result).toBe('unknown');
    expect(results[0]?.reason_code).toBe('UNVISITED_TARGET');
  });

  it('returns pass for confirmed reachable link (in visitedTargets, not broken)', () => {
    const page = makePage({ html: '<html><head></head><body><a href="/about">About</a></body></html>' });
    const visited = new Set(['http://example.com/about']);
    const results = checkSEO002(page, new Set(), visited);
    expect(results).toHaveLength(1);
    expect(results[0]?.result).toBe('pass');
    expect(results[0]?.reason_code).toBe('REACHABLE_LINK');
  });

  it('finds broken internal link', () => {
    const page = makePage({ html: '<html><head></head><body><a href="/missing">Missing</a></body></html>' });
    const broken = new Set(['http://example.com/missing']);
    const results = checkSEO002(page, broken);
    expect(results).toHaveLength(1);
    expect(results[0]?.result).toBe('fail');
    expect(results[0]?.reason_code).toBe('BROKEN_INTERNAL_LINK');
  });

  it('two broken links on same page produce two separate fail findings without crash', () => {
    const page = makePage({
      html: '<html><head></head><body><a href="/missing1">M1</a><a href="/missing2">M2</a></body></html>',
    });
    const broken = new Set(['http://example.com/missing1', 'http://example.com/missing2']);
    const results = checkSEO002(page, broken);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.result === 'fail')).toBe(true);
    // Each finding has a distinct occurrence_key
    expect(results[0]?.occurrence_key).toBe('http://example.com/missing1');
    expect(results[1]?.occurrence_key).toBe('http://example.com/missing2');
  });

  it('robots-blocked URL in visitedTargets should NOT produce a pass (unknown instead)', () => {
    // Simulates the bug fix: visitedTargets must only contain successfully fetched pages.
    // If a robots-blocked URL were included, checkSEO002 would emit a false "pass".
    // The fix is in rules.ts (building visitedUrls from successfully-fetched pages only),
    // but we verify the contract here: if visitedTargets does NOT contain the target URL,
    // the result is 'unknown' (not 'pass').
    const page = makePage({
      html: '<html><head></head><body><a href="/blocked-page">Blocked</a></body></html>',
    });
    // Do NOT include the robots-blocked URL in visitedTargets
    const visited = new Set<string>(); // empty — robots-blocked page not in visited set
    const results = checkSEO002(page, new Set(), visited);
    expect(results).toHaveLength(1);
    // Should be unknown (not visited/assessed), not pass (not confirmed reachable)
    expect(results[0]?.result).toBe('unknown');
    expect(results[0]?.reason_code).toBe('UNVISITED_TARGET');
  });

  it('two broken links produce distinct occurrence_keys', () => {
    const page = makePage({
      html: '<html><head></head><body><a href="/a">A</a><a href="/b">B</a></body></html>',
    });
    const broken = new Set(['http://example.com/a', 'http://example.com/b']);
    const results = checkSEO002(page, broken);
    const keys = results.map(r => r.occurrence_key);
    expect(new Set(keys).size).toBe(2); // all distinct
  });
});

describe('SEO003 — Redirect loops', () => {
  it('passes when no redirects', () => {
    expect(checkSEO003(makePage())?.result).toBe('pass');
  });

  it('passes for a short valid redirect chain', () => {
    const page = makePage({ redirectChain: ['http://example.com/old'] });
    expect(checkSEO003(page)?.result).toBe('pass');
  });

  it('detects redirect loop', () => {
    const page = makePage({ redirectChain: ['http://example.com/a', 'http://example.com/b', 'http://example.com/a'] });
    const result = checkSEO003(page);
    expect(result?.reason_code).toBe('REDIRECT_LOOP');
    expect(result?.severity).toBe('high');
  });

  it('detects excessive redirects', () => {
    const page = makePage({ redirectChain: ['http://example.com/1', 'http://example.com/2', 'http://example.com/3', 'http://example.com/4', 'http://example.com/5', 'http://example.com/6'] });
    const result = checkSEO003(page);
    expect(result?.reason_code).toBe('EXCESSIVE_REDIRECTS');
  });

  it('fails with REDIRECT_LIMIT_EXCEEDED when fetcher hit the redirect limit (5 chain entries + REDIRECT_LIMIT_EXCEEDED error)', () => {
    // This reproduces the bug: fetcher stops at hop == maxRedirects (5), returns fetchError=REDIRECT_LIMIT_EXCEEDED
    // The chain has 5 entries (all distinct, so no loop), but the fetch was aborted
    const page = makePage({
      httpStatus: 301,
      html: null,
      fetchError: 'REDIRECT_LIMIT_EXCEEDED',
      redirectChain: [
        'http://example.com/r1',
        'http://example.com/r2',
        'http://example.com/r3',
        'http://example.com/r4',
        'http://example.com/r5',
      ],
    });
    const result = checkSEO003(page);
    expect(result?.result).toBe('fail');
    expect(result?.reason_code).toBe('REDIRECT_LIMIT_EXCEEDED');
    expect(result?.severity).toBe('high');
  });

  it('returns null when not yet fetched', () => {
    expect(checkSEO003(makePage({ httpStatus: null, fetchError: null }))).toBeNull();
  });
});

describe('SEO004 — Robots denial', () => {
  it('passes when not blocked', () => {
    expect(checkSEO004(makePage())?.result).toBe('pass');
  });

  it('reports robots.txt block as not_applicable', () => {
    const result = checkSEO004(makePage({ robotsDirective: 'blocked_by_robots_txt' }));
    expect(result?.result).toBe('not_applicable');
    expect(result?.reason_code).toBe('BLOCKED_BY_ROBOTS_TXT');
  });
});

describe('SEO005 — Noindex', () => {
  it('passes for indexable page', () => {
    expect(checkSEO005(makePage())?.result).toBe('pass');
  });

  it('detects meta robots noindex', () => {
    const page = makePage({ html: '<html><head><meta name="robots" content="noindex"><title>T</title></head><body></body></html>' });
    const result = checkSEO005(page);
    expect(result?.result).toBe('fail');
    expect(result?.reason_code).toBe('NOINDEX_DIRECTIVE');
    expect(result?.severity).toBe('high');
  });

  it('detects X-Robots-Tag noindex', () => {
    const page = makePage({ robotsDirective: 'noindex' });
    const result = checkSEO005(page);
    expect(result?.result).toBe('fail');
  });

  it('returns null for 404 pages', () => {
    const page = makePage({ httpStatus: 404, html: null });
    expect(checkSEO005(page)).toBeNull();
  });
});

describe('SEO006 — Empty/missing title', () => {
  it('passes when title present', () => {
    expect(checkSEO006(makePage())?.result).toBe('pass');
  });

  it('detects missing title element', () => {
    const page = makePage({ html: '<html><head></head><body></body></html>' });
    const result = checkSEO006(page);
    expect(result?.result).toBe('fail');
    expect(result?.reason_code).toBe('MISSING_TITLE');
  });

  it('detects empty title element', () => {
    const page = makePage({ html: '<html><head><title>   </title></head><body></body></html>' });
    const result = checkSEO006(page);
    expect(result?.result).toBe('fail');
    expect(result?.reason_code).toBe('EMPTY_TITLE');
  });
});

describe('SEO007 — Duplicate titles', () => {
  it('returns pass entries for unique titles', () => {
    const pages = [
      makePage({ url: 'http://example.com/', html: '<html><head><title>Home</title></head><body></body></html>' }),
      makePage({ url: 'http://example.com/about', html: '<html><head><title>About</title></head><body></body></html>' }),
    ];
    const results = checkSEO007(pages);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.result === 'pass')).toBe(true);
  });

  it('detects duplicate titles across pages', () => {
    const pages = [
      makePage({ url: 'http://example.com/a', html: '<html><head><title>Same Title</title></head><body></body></html>' }),
      makePage({ url: 'http://example.com/b', html: '<html><head><title>Same Title</title></head><body></body></html>' }),
    ];
    const results = checkSEO007(pages);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.result === 'review')).toBe(true);
    expect(results[0]?.reason_code).toBe('DUPLICATE_TITLE');
  });
});

describe('SEO008 — Conflicting canonicals', () => {
  it('passes when single canonical present', () => {
    const page = makePage({ html: '<html><head><link rel="canonical" href="http://example.com/"><title>T</title></head><body></body></html>' });
    expect(checkSEO008(page)?.result).toBe('pass');
  });

  it('returns null when no canonical declared', () => {
    expect(checkSEO008(makePage())).toBeNull();
  });

  it('detects conflicting canonicals', () => {
    const page = makePage({
      html: '<html><head><link rel="canonical" href="http://example.com/"><link rel="canonical" href="http://example.com/home"><title>T</title></head><body></body></html>',
    });
    const result = checkSEO008(page);
    expect(result?.result).toBe('fail');
    expect(result?.reason_code).toBe('CONFLICTING_CANONICALS');
  });
});

describe('SEO009 — Invalid JSON-LD', () => {
  it('returns empty for page with no JSON-LD', () => {
    expect(checkSEO009(makePage())).toHaveLength(0);
  });

  it('returns pass for valid JSON-LD', () => {
    const page = makePage({ html: '<html><head><script type="application/ld+json">{"@type":"WebPage"}</script></head><body></body></html>' });
    const results = checkSEO009(page);
    expect(results).toHaveLength(1);
    expect(results[0]?.result).toBe('pass');
  });

  it('detects invalid JSON-LD', () => {
    const page = makePage({ html: '<html><head><script type="application/ld+json">{ invalid json </script></head><body></body></html>' });
    const results = checkSEO009(page);
    expect(results).toHaveLength(1);
    expect(results[0]?.result).toBe('fail');
    expect(results[0]?.reason_code).toBe('INVALID_JSON_LD');
  });

  it('handles multiple JSON-LD blocks — pass for valid, fail for invalid', () => {
    const page = makePage({
      html: '<html><head><script type="application/ld+json">{"@type":"WebPage"}</script><script type="application/ld+json">{ bad </script></head><body></body></html>',
    });
    const results = checkSEO009(page);
    expect(results).toHaveLength(2);
    expect(results.some(r => r.result === 'pass')).toBe(true);
    expect(results.some(r => r.result === 'fail')).toBe(true);
    // Each finding has a distinct occurrence_key
    expect(results[0]?.occurrence_key).toBe('block_0');
    expect(results[1]?.occurrence_key).toBe('block_1');
  });

  it('two malformed JSON-LD blocks produce two fail findings with distinct occurrence_keys', () => {
    const page = makePage({
      html: '<html><head><script type="application/ld+json">{ bad1 </script><script type="application/ld+json">{ bad2 </script></head><body></body></html>',
    });
    const results = checkSEO009(page);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.result === 'fail')).toBe(true);
    expect(results[0]?.occurrence_key).toBe('block_0');
    expect(results[1]?.occurrence_key).toBe('block_1');
  });
});

describe('SEO010 — Sitemap/noindex conflict', () => {
  it('returns null when not in sitemap', () => {
    const page = makePage({ html: '<html><head><meta name="robots" content="noindex"><title>T</title></head><body></body></html>' });
    expect(checkSEO010(page, false)).toBeNull();
  });

  it('detects noindex on sitemap URL', () => {
    const page = makePage({ html: '<html><head><meta name="robots" content="noindex"><title>T</title></head><body></body></html>' });
    const result = checkSEO010(page, true);
    expect(result?.result).toBe('fail');
    expect(result?.reason_code).toBe('SITEMAP_NOINDEX_CONFLICT');
  });

  it('passes when sitemap URL is indexable', () => {
    expect(checkSEO010(makePage(), true)?.result).toBe('pass');
  });
});
