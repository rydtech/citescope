export const AuditState = {
  QUEUED: 'queued',
  RUNNING: 'running',
  PARTIAL: 'partial',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;
export type AuditState = (typeof AuditState)[keyof typeof AuditState];

export const FindingState = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  ACCEPTED_RISK: 'accepted_risk',
  SUPPRESSED: 'suppressed',
} as const;
export type FindingState = (typeof FindingState)[keyof typeof FindingState];

export const RuleResult = {
  PASS: 'pass',
  FAIL: 'fail',
  REVIEW: 'review',
  NOT_APPLICABLE: 'not_applicable',
  UNKNOWN: 'unknown',
} as const;
export type RuleResult = (typeof RuleResult)[keyof typeof RuleResult];

export const WorkspaceRole = {
  OWNER: 'owner',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;
export type WorkspaceRole = (typeof WorkspaceRole)[keyof typeof WorkspaceRole];

export const JobQueue = {
  CRAWL: 'crawl',
  RENDER: 'render',
  RULES: 'rules',
  REPORT: 'report',
} as const;
export type JobQueue = (typeof JobQueue)[keyof typeof JobQueue];

export const Severity = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  ADVISORY: 'advisory',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];
