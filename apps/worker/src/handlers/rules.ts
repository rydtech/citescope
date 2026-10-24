import type { Job } from 'bullmq';
import { getDb, updateAuditRunState, getPagesByAuditRun, getExtractionsByAuditRun, createFindings, createEvidenceArtifact, linkEvidenceToFinding, incrementAuditCounter } from '@citescope/database';
import {
  checkSEO001, checkSEO002, checkSEO003, checkSEO004, checkSEO005,
  checkSEO006, checkSEO007, checkSEO008, checkSEO009, checkSEO010,
  RULE_VERSIONS, type PageData, type RuleOutput,
} from '@citescope/audit-rules';
import { RulesJobPayloadSchema } from '@citescope/contracts';
import { logger } from '../logger.js';
import { reportQueue } from '../queue.js';

export async function handleRulesJob(job: Job): Promise<void> {
  const { audit_run_id, workspace_id } = RulesJobPayloadSchema.parse(job.data);
  logger.info('Rules job started', { audit_run_id, workspace_id });

  const sql = getDb();

  // Load pages
  const dbPages = await getPagesByAuditRun(audit_run_id, workspace_id);

  // Load extraction records (structured HTML data extracted at crawl time)
  const extractions = await getExtractionsByAuditRun(audit_run_id, workspace_id).catch(() => []);
  const extractionMap = new Map(extractions.map(e => [e.page_id, e]));

  // Load broken_urls and sitemap_page_urls from config_snapshot
  const [runRow] = await sql<[{ config_snapshot: { broken_urls?: string[]; sitemap_urls?: string[]; sitemap_page_urls?: string[] } }]>`
    SELECT config_snapshot FROM audit_runs WHERE id = ${audit_run_id} LIMIT 1
  `;
  const brokenUrls = new Set<string>(runRow?.config_snapshot?.broken_urls ?? []);
  // sitemap_page_urls are actual page URLs parsed from sitemap documents (Phase 9)
  // sitemap_urls is the legacy field (sitemap document URLs from robots.txt)
  const sitemapPageUrls = new Set<string>([
    ...(runRow?.config_snapshot?.sitemap_page_urls ?? []),
    // Fall back: if no sitemap_page_urls, sitemap_urls were never parsed — don't use as page URLs
  ]);

  // Build the set of SUCCESSFULLY FETCHED URLs for SEO002 link-reachability assessment.
  // Only pages that returned a successful HTTP status (non-4xx/5xx) without a fetch error
  // and without being blocked by robots.txt count as "reachable" for pass classification.
  // Robots-blocked, failed, or errored pages must NOT be treated as reachable — doing so
  // would produce false "pass" results for links pointing to blocked/broken targets.
  const visitedUrls = new Set<string>(
    dbPages
      .filter(p =>
        p.http_status !== null &&
        p.http_status < 400 &&
        !p.fetch_error &&
        p.robots_directive !== 'blocked_by_robots_txt'
      )
      .map(p => p.requested_url)
  );

  // Build pagesWithHtml: reconstruct COMPLETE HTML from extraction records only.
  // If no extraction record exists (e.g. extraction failed, non-HTML content, or
  // pre-migration data), html is set to null — rules will return unknown/not-applicable
  // rather than false passes from a minimal synthetic fallback.
  // Only text/html content types produce HTML for rule evaluation.
  const pagesWithHtml: PageData[] = dbPages.map(p => {
    let html: string | null = null;
    const extraction = extractionMap.get(p.id);
    const isHtmlContent = p.content_type?.toLowerCase().startsWith('text/html') ?? false;

    if (extraction && isHtmlContent) {
      // Reconstruct complete HTML from structured extraction data
      const titleHtml = extraction.title ? `<title>${escapeHtml(extraction.title)}</title>` : '';
      const robotsHtml = extraction.meta_robots
        ? `<meta name="robots" content="${escapeHtml(extraction.meta_robots)}">`
        : '';
      const canonicalHtmls = (extraction.canonical_urls as string[]).map(
        href => `<link rel="canonical" href="${escapeHtml(href)}">`
      ).join('');
      const jsonLdHtmls = (extraction.json_ld_blocks as string[]).map(
        block => `<script type="application/ld+json">${block}</script>`
      ).join('');
      const linkHtmls = (extraction.internal_links as Array<{ href: string }>).map(
        l => `<a href="${escapeHtml(l.href)}"></a>`
      ).join('');
      html = `<!DOCTYPE html><html><head>${titleHtml}${robotsHtml}${canonicalHtmls}${jsonLdHtmls}</head><body>${linkHtmls}</body></html>`;
    }
    // If extraction is missing or content is not text/html, html stays null.
    // Rules that require HTML will return [] / null (not-applicable or unknown).

    return {
      url: p.requested_url,
      finalUrl: p.final_url,
      httpStatus: p.http_status,
      contentType: p.content_type,
      html,
      redirectChain: Array.isArray(p.redirect_chain) ? p.redirect_chain as string[] : [],
      robotsDirective: p.robots_directive,
      fetchError: p.fetch_error,
    };
  });

  const allOutputs: RuleOutput[] = [];

  // Per-page rules
  for (const page of pagesWithHtml) {
    const seo001 = checkSEO001(page);
    if (seo001) allOutputs.push(seo001);

    const seo002Results = checkSEO002(page, brokenUrls, visitedUrls);
    allOutputs.push(...seo002Results);

    const seo003 = checkSEO003(page);
    if (seo003) allOutputs.push(seo003);

    const seo004 = checkSEO004(page);
    if (seo004) allOutputs.push(seo004);

    const seo005 = checkSEO005(page);
    if (seo005) allOutputs.push(seo005);

    const seo006 = checkSEO006(page);
    if (seo006) allOutputs.push(seo006);

    const seo008 = checkSEO008(page);
    if (seo008) allOutputs.push(seo008);

    const seo009Results = checkSEO009(page);
    allOutputs.push(...seo009Results);

    const seo010 = checkSEO010(page, sitemapPageUrls.has(page.url));
    if (seo010) allOutputs.push(seo010);
  }

  // Site-level rules
  const seo007Results = checkSEO007(pagesWithHtml);
  allOutputs.push(...seo007Results);

  // Save findings and evidence
  if (allOutputs.length > 0) {
    // Build URL → page ID map for evidence page_id linking (Issue 11)
    const pageIdByUrl = new Map(dbPages.map(p => [p.requested_url, p.id]));

    // createFindings inserts one row at a time to avoid PostgreSQL error 21000
    // ("ON CONFLICT DO UPDATE command cannot affect row a second time") when
    // multiple findings in the same batch share the same conflict key.
    // The returned array preserves insertion order so findings[i] corresponds to allOutputs[i].
    const findings = await createFindings(allOutputs.map(o => ({
      workspace_id,
      audit_run_id,
      rule_id: o.rule_id,
      rule_version: o.rule_version,
      result: o.result,
      severity: o.severity,
      url: o.url ?? null,
      occurrence_key: o.occurrence_key ?? null,
      title: o.title,
      description: o.description,
      remediation: o.remediation,
      retest_instructions: o.retest_instructions,
    })));

    // Link evidence to findings by position (allOutputs[i] → findings[i])
    for (let i = 0; i < allOutputs.length; i++) {
      const output = allOutputs[i]!;
      const finding = findings[i];
      if (!finding) continue; // should not happen but guard anyway
      for (const ev of output.evidence) {
        const artifact = await createEvidenceArtifact({
          workspace_id, audit_run_id,
          page_id: pageIdByUrl.get(output.url ?? '') ?? null,
          artifact_type: 'rule_evidence',
          storage_ref: null,
          excerpt: ev.excerpt ?? ev.observed_value,
          selector: ev.selector ?? null,
          content_hash: null,
          extraction_mode: ev.extraction_mode,
          rule_id: output.rule_id,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          is_redacted: false,
        });
        await linkEvidenceToFinding(finding.id, artifact.id);
      }
    }
  }

  // Update rule_versions in the run
  await sql`
    UPDATE audit_runs
    SET rule_versions = ${sql.json(RULE_VERSIONS)},
        pages_evaluated = ${pagesWithHtml.filter(p => p.httpStatus !== null && p.httpStatus < 400).length},
        updated_at = NOW()
    WHERE id = ${audit_run_id}
  `;

  // Enqueue report
  await reportQueue.add('report.generate', { audit_run_id, workspace_id }, {
    jobId: `report${audit_run_id.replace(/-/g, '')}`,
  });

  logger.info('Rules job complete', { audit_run_id, findings_count: allOutputs.length });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
