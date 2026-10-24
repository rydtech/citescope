import type { RuleOutput } from '@citescope/audit-rules';

export const SCORE_VERSION = '1.2.0';
export const MIN_COVERAGE_THRESHOLD = 0.8;

const SEVERITY_WEIGHTS: Record<string, number> = {
  high: 3, medium: 2, low: 1, advisory: 0,
};

export interface RuleScore {
  rule_id: string;
  passed: number;
  failed: number;
  review: number;
  unknown: number;
  total: number;
  coverage: number;
  pass_fraction: number | null;
  weight: number;
  insufficient_data: boolean;
}

export interface CategoryScore {
  category: string;
  score: number | null;
  insufficient_data: boolean;
  coverage: number;
  rule_scores: RuleScore[];
  score_version: string;
}

export function computeRuleScore(
  ruleId: string,
  findings: RuleOutput[],
  severity: string,
  expectedAssessments?: number
): RuleScore {
  const forRule = findings.filter(f => f.rule_id === ruleId);
  const passed = forRule.filter(f => f.result === 'pass').length;
  const failed = forRule.filter(f => f.result === 'fail').length;
  const review = forRule.filter(f => f.result === 'review').length;
  const unknown = forRule.filter(f => f.result === 'unknown').length;
  const emitted = passed + failed + review + unknown;

  // When expectedAssessments is provided (e.g. number of HTML pages that should have been
  // assessed by this rule), use it as the denominator for coverage. Pages that had no
  // extraction data are assessment gaps — they reduce coverage rather than disappearing
  // from the denominator entirely (which would falsely inflate coverage).
  const total = expectedAssessments != null && expectedAssessments > emitted
    ? expectedAssessments
    : emitted;

  const weight = SEVERITY_WEIGHTS[severity] ?? 1;

  if (total === 0) {
    return { rule_id: ruleId, passed: 0, failed: 0, review: 0, unknown: 0, total: 0, coverage: 0, pass_fraction: null, weight, insufficient_data: true };
  }

  const coverage = (passed + failed) / total;
  const pass_fraction = passed + failed > 0 ? passed / (passed + failed) : null;
  const insufficient_data = coverage < MIN_COVERAGE_THRESHOLD || pass_fraction === null;

  return { rule_id: ruleId, passed, failed, review, unknown, total, coverage, pass_fraction, weight, insufficient_data };
}

/**
 * Minimum fraction of applicable rules that must have sufficient data
 * for a category score to be returned. If fewer rules have data, we return
 * insufficient_data=true rather than a score inflated by sparse coverage.
 */
export const MIN_RULES_COVERAGE_FRACTION = 0.5;

export function computeTechnicalScore(
  ruleScores: RuleScore[],
  opts: { minRulesCoverageFraction?: number } = {}
): { score: number | null; insufficient_data: boolean; assessed_rules: number; total_rules: number } {
  const minFraction = opts.minRulesCoverageFraction ?? MIN_RULES_COVERAGE_FRACTION;
  const totalRules = ruleScores.filter(r => r.weight > 0).length;
  const eligible = ruleScores.filter(r => !r.insufficient_data && r.pass_fraction !== null && r.weight > 0);

  // Gate: if fewer than minFraction of applicable rules have sufficient data, return insufficient_data
  if (eligible.length === 0 || (totalRules > 0 && eligible.length / totalRules < minFraction)) {
    return { score: null, insufficient_data: true, assessed_rules: eligible.length, total_rules: totalRules };
  }

  const weightedSum = eligible.reduce((s, r) => s + r.pass_fraction! * r.weight, 0);
  const totalWeight = eligible.reduce((s, r) => s + r.weight, 0);
  return {
    score: totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : null,
    insufficient_data: false,
    assessed_rules: eligible.length,
    total_rules: totalRules,
  };
}
