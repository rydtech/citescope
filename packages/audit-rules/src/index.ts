export * from './types.js';
export { checkSEO001 } from './rules/seo001.js';
export { checkSEO002 } from './rules/seo002.js';
export { checkSEO003 } from './rules/seo003.js';
export { checkSEO004 } from './rules/seo004.js';
export { checkSEO005 } from './rules/seo005.js';
export { checkSEO006 } from './rules/seo006.js';
export { checkSEO007 } from './rules/seo007.js';
export { checkSEO008 } from './rules/seo008.js';
export { checkSEO009 } from './rules/seo009.js';
export { checkSEO010 } from './rules/seo010.js';

export const RULE_VERSIONS: Record<string, string> = {
  SEO001: '1.0.0', SEO002: '1.0.0', SEO003: '1.0.0', SEO004: '1.0.0', SEO005: '1.0.0',
  SEO006: '1.0.0', SEO007: '1.0.0', SEO008: '1.0.0', SEO009: '1.0.0', SEO010: '1.0.0',
};
