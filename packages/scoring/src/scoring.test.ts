import { describe, it, expect } from 'vitest';
import { computeRuleScore, computeTechnicalScore, MIN_COVERAGE_THRESHOLD, MIN_RULES_COVERAGE_FRACTION } from './index.js';
import type { RuleOutput } from '@citescope/audit-rules';

function makeOutput(ruleId: string, result: RuleOutput['result']): RuleOutput {
  return {
    rule_id: ruleId, rule_version: '1.0.0',
    result, reason_code: 'TEST',
    severity: 'medium', url: 'http://example.com/',
    title: 'Test', description: 'Test', remediation: 'Fix it', retest_instructions: 'Re-run', evidence: [],
  };
}

describe('computeRuleScore', () => {
  it('returns insufficient_data when no findings', () => {
    const score = computeRuleScore('SEO001', [], 'high');
    expect(score.insufficient_data).toBe(true);
    expect(score.pass_fraction).toBeNull();
    expect(score.total).toBe(0);
  });

  it('calculates perfect pass fraction', () => {
    const findings = [makeOutput('SEO001', 'pass'), makeOutput('SEO001', 'pass')];
    const score = computeRuleScore('SEO001', findings, 'high');
    expect(score.pass_fraction).toBe(1);
    expect(score.passed).toBe(2);
    expect(score.failed).toBe(0);
    expect(score.insufficient_data).toBe(false);
  });

  it('calculates partial pass fraction', () => {
    const findings = [makeOutput('SEO001', 'pass'), makeOutput('SEO001', 'fail')];
    const score = computeRuleScore('SEO001', findings, 'medium');
    expect(score.pass_fraction).toBe(0.5);
  });

  it('marks insufficient_data when coverage below threshold', () => {
    // 1 pass, 9 unknown -> coverage = 1/10 = 0.1 < 0.8
    const findings = [
      makeOutput('SEO001', 'pass'),
      ...Array(9).fill(makeOutput('SEO001', 'unknown')),
    ];
    const score = computeRuleScore('SEO001', findings, 'medium');
    expect(score.coverage).toBeLessThan(MIN_COVERAGE_THRESHOLD);
    expect(score.insufficient_data).toBe(true);
  });
});

  it('100 HTML pages, only 1 with extraction — coverage < 80% → insufficient_data', () => {
    // Only 1 page had extraction data, so only 1 pass finding was emitted.
    // The other 99 pages had no extraction → 99 assessment gaps.
    // expectedAssessments=100 forces the denominator to 100.
    // coverage = 1/100 = 0.01 which is < 0.8 → insufficient_data.
    const findings = [makeOutput('SEO005', 'pass')];
    const score = computeRuleScore('SEO005', findings, 'high', 100);
    expect(score.total).toBe(100);
    expect(score.coverage).toBeCloseTo(0.01);
    expect(score.insufficient_data).toBe(true);
  });

  it('expectedAssessments smaller than emitted is ignored (emitted takes precedence)', () => {
    // If somehow more findings were emitted than expected, use emitted count.
    const findings = [makeOutput('SEO005', 'pass'), makeOutput('SEO005', 'pass'), makeOutput('SEO005', 'pass')];
    const score = computeRuleScore('SEO005', findings, 'high', 2 /* less than 3 emitted */);
    // emitted=3 > expectedAssessments=2 → total=3 (emitted wins)
    expect(score.total).toBe(3);
  });

describe('computeTechnicalScore', () => {
  it('returns null when all rules have insufficient data', () => {
    const ruleScores = [
      computeRuleScore('SEO001', [], 'high'),
      computeRuleScore('SEO006', [], 'medium'),
    ];
    const result = computeTechnicalScore(ruleScores);
    expect(result.score).toBeNull();
    expect(result.insufficient_data).toBe(true);
  });

  it('computes weighted score', () => {
    // SEO001 (weight 3): 100% pass
    // SEO006 (weight 2): 0% pass
    // Weighted: (1*3 + 0*2) / (3+2) = 3/5 = 0.6 -> 60
    const seo001Findings = [makeOutput('SEO001', 'pass')];
    const seo006Findings = [makeOutput('SEO006', 'fail')];

    const ruleScores = [
      { ...computeRuleScore('SEO001', seo001Findings, 'high'), weight: 3 },
      { ...computeRuleScore('SEO006', seo006Findings, 'medium'), weight: 2 },
    ];
    const result = computeTechnicalScore(ruleScores);
    expect(result.score).toBe(60);
    expect(result.insufficient_data).toBe(false);
  });

  it('returns insufficient_data when only 1 of 10 rules has data (below 50% threshold)', () => {
    // 1 rule passes, 9 rules have no data
    const seo001Findings = [makeOutput('SEO001', 'pass')];
    const ruleScores = [
      computeRuleScore('SEO001', seo001Findings, 'high'),
      ...Array.from({ length: 9 }, (_, i) => computeRuleScore(`SEO00${i + 2}`, [], 'medium')),
    ];
    const result = computeTechnicalScore(ruleScores);
    expect(result.insufficient_data).toBe(true);
    expect(result.score).toBeNull();
    expect(result.assessed_rules).toBe(1);
    expect(result.total_rules).toBe(10);
  });

  it('exposes assessed_rules and total_rules counts', () => {
    const seo001Findings = [makeOutput('SEO001', 'pass')];
    const seo006Findings = [makeOutput('SEO006', 'fail')];
    const ruleScores = [
      computeRuleScore('SEO001', seo001Findings, 'high'),
      computeRuleScore('SEO006', seo006Findings, 'medium'),
    ];
    const result = computeTechnicalScore(ruleScores);
    expect(result.assessed_rules).toBe(2);
    expect(result.total_rules).toBe(2);
  });

  it('5 passing rules + 5 zero-observation rules returns insufficient_data (exactly at boundary)', () => {
    // 5 of 10 rules = exactly 50% — boundary is < 50%, so 50% should produce a score.
    // Verify the boundary condition precisely.
    const passingFindings = Array.from({ length: 5 }, (_, i) =>
      [makeOutput(`SEO00${i + 1}`, 'pass')]
    );
    const ruleScores = [
      ...passingFindings.map((findings, i) =>
        computeRuleScore(`SEO00${i + 1}`, findings, 'medium')
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        computeRuleScore(`SEO0${i + 6}`, [], 'medium')
      ),
    ];
    const result = computeTechnicalScore(ruleScores);
    // 5/10 = 0.5 which is NOT less than minFraction (0.5), so score is returned
    expect(result.insufficient_data).toBe(false);
    expect(result.score).not.toBeNull();
    expect(result.assessed_rules).toBe(5);
    expect(result.total_rules).toBe(10);
  });

  it('4 passing rules + 6 zero-observation rules returns insufficient_data (below 50%)', () => {
    const passingFindings = Array.from({ length: 4 }, (_, i) =>
      [makeOutput(`SEO00${i + 1}`, 'pass')]
    );
    const ruleScores = [
      ...passingFindings.map((findings, i) =>
        computeRuleScore(`SEO00${i + 1}`, findings, 'medium')
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        computeRuleScore(`SEO0${i + 5}`, [], 'medium')
      ),
    ];
    const result = computeTechnicalScore(ruleScores);
    // 4/10 = 0.4 < 0.5 → insufficient_data
    expect(result.insufficient_data).toBe(true);
    expect(result.score).toBeNull();
  });

  it('MIN_RULES_COVERAGE_FRACTION is 0.5', () => {
    expect(MIN_RULES_COVERAGE_FRACTION).toBe(0.5);
  });
});
