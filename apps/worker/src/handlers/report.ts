import type { Job } from 'bullmq';
import { getDb, getFindingsByAuditRun, getPagesByAuditRun } from '@citescope/database';
import { computeRuleScore, computeTechnicalScore, SCORE_VERSION } from '@citescope/scoring';
import { RULE_VERSIONS } from '@citescope/audit-rules';
import type { RuleOutput } from '@citescope/audit-rules';
import { ReportJobPayloadSchema } from '@citescope/contracts';
import { logger } from '../logger.js';

const RULE_SEVERITIES: Record<string, string> = {
  SEO001: 'high', SEO002: 'medium', SEO003: 'high', SEO004: 'low', SEO005: 'high',
  SEO006: 'medium', SEO007: 'medium', SEO008: 'medium', SEO009: 'low', SEO010: 'medium',
};

export async function handleReportJob(job: Job): Promise<void> {
  const { audit_run_id, workspace_id } = ReportJobPayloadSchema.parse(job.data);
  logger.info('Report job started', { audit_run_id, workspace_id });

  const sql = getDb();
  const [dbFindings, dbPages] = await Promise.all([
    getFindingsByAuditRun(audit_run_id, workspace_id),
    getPagesByAuditRun(audit_run_id, workspace_id),
  ]);

  // Count HTML pages that were successfully fetched — these are the eligible pages for
  // HTML-dependent rules (SEO005, SEO006, SEO007, SEO008, SEO009).
  // Pages without extraction data are assessment gaps that reduce coverage, so we pass
  // this count as expectedAssessments to computeRuleScore for HTML-dependent rules.
  const htmlPageCount = dbPages.filter(p =>
    p.content_type?.toLowerCase().startsWith('text/html') &&
    p.http_status !== null &&
    p.http_status < 400 &&
    !p.fetch_error &&
    p.robots_directive !== 'blocked_by_robots_txt'
  ).length;

  // Rules that operate on HTML page content (per-page)
  const HTML_DEPENDENT_RULES = new Set(['SEO005', 'SEO006', 'SEO007', 'SEO008', 'SEO009']);

  // Convert to RuleOutput shape for scoring
  const ruleOutputs: RuleOutput[] = dbFindings.map(f => ({
    rule_id: f.rule_id,
    rule_version: f.rule_version,
    result: f.result,
    reason_code: '',
    severity: f.severity,
    url: f.url,
    title: f.title,
    description: f.description,
    remediation: f.remediation,
    retest_instructions: f.retest_instructions,
    evidence: [],
  }));

  // SEO009 emits one finding per JSON-LD block on a page. Before scoring, normalize
  // to one result per page URL so multiple blocks on one page cannot substitute for
  // observations missing from other pages. The worst result per page is used.
  // (Findings remain as-is in the database for evidence display.)
  const RESULT_ORDER: Record<string, number> = { pass: 0, unknown: 1, review: 2, fail: 3 };
  function normalizeToPageLevel(outputs: RuleOutput[], ruleId: string): RuleOutput[] {
    const forRule = outputs.filter(f => f.rule_id === ruleId);
    const pageMap = new Map<string, RuleOutput>();
    for (const finding of forRule) {
      const key = finding.url ?? '__site__';
      const existing = pageMap.get(key);
      if (!existing || (RESULT_ORDER[finding.result] ?? 0) > (RESULT_ORDER[existing.result] ?? 0)) {
        pageMap.set(key, finding);
      }
    }
    return [...outputs.filter(f => f.rule_id !== ruleId), ...pageMap.values()];
  }

  const scoringOutputs = normalizeToPageLevel(ruleOutputs, 'SEO009');

  const ruleScores = Object.keys(RULE_VERSIONS).map(ruleId =>
    computeRuleScore(
      ruleId,
      scoringOutputs,
      RULE_SEVERITIES[ruleId] ?? 'medium',
      // Pass expected assessments for HTML-dependent rules so missing extractions
      // reduce coverage rather than disappearing from the denominator.
      HTML_DEPENDENT_RULES.has(ruleId) && htmlPageCount > 0 ? htmlPageCount : undefined
    )
  );

  const { score, insufficient_data, assessed_rules, total_rules } = computeTechnicalScore(ruleScores);

  // Store score in config_snapshot, including coverage counts for display in the UI.
  // Only transition to 'completed' if the audit is not already in a terminal state
  // (canceled, failed). This prevents a retried report job from overwriting a terminal state.
  const [updatedRun] = await sql`
    UPDATE audit_runs
    SET
      config_snapshot = config_snapshot || ${sql.json({
        technical_score: score,
        technical_score_insufficient_data: insufficient_data,
        score_version: SCORE_VERSION,
        rule_scores: ruleScores,
        assessed_rules,
        total_rules,
      } as never)},
      state = CASE WHEN state NOT IN ('canceled', 'failed') THEN 'completed' ELSE state END,
      completed_at = CASE WHEN state NOT IN ('canceled', 'failed') THEN NOW() ELSE completed_at END,
      updated_at = NOW()
    WHERE id = ${audit_run_id}
    RETURNING state
  `;

  // Only insert a completed transition if we actually transitioned to completed
  if (updatedRun?.state === 'completed') {
    await sql`
      INSERT INTO audit_state_transitions (audit_run_id, to_state) VALUES (${audit_run_id}, 'completed')
      ON CONFLICT DO NOTHING
    `;
  }

  logger.info('Report complete', { audit_run_id, score, insufficient_data });
}
