export interface PageData {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  contentType: string | null;
  html: string | null;
  redirectChain: string[];
  robotsDirective: string | null;
  fetchError: string | null;
}

export interface RuleEvidence {
  url: string;
  observed_value: string;
  timestamp: string;
  extraction_mode: 'http' | 'rendered';
  rule_version: string;
  selector?: string;
  excerpt?: string;
}

export type RuleResultValue = 'pass' | 'fail' | 'review' | 'not_applicable' | 'unknown';
export type SeverityValue = 'high' | 'medium' | 'low' | 'advisory';

export interface RuleOutput {
  rule_id: string;
  rule_version: string;
  result: RuleResultValue;
  reason_code: string;
  severity: SeverityValue;
  url: string | null;
  /** Stable per-occurrence key for rules that emit multiple findings per (page, rule).
   * Examples: broken target URL for SEO002, block index string for SEO009.
   * NULL means at most one finding per (audit_run_id, rule_id, url). */
  occurrence_key?: string | null;
  title: string;
  description: string;
  remediation: string;
  retest_instructions: string;
  evidence: RuleEvidence[];
}
