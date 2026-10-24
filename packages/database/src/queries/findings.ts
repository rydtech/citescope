import { getDb } from '../client.js';

export interface Finding {
  id: string;
  workspace_id: string;
  audit_run_id: string;
  rule_id: string;
  rule_version: string;
  result: 'pass' | 'fail' | 'review' | 'not_applicable' | 'unknown';
  severity: 'high' | 'medium' | 'low' | 'advisory';
  state: 'open' | 'in_progress' | 'resolved' | 'accepted_risk' | 'suppressed';
  url: string | null;
  occurrence_key: string | null;
  title: string;
  description: string;
  remediation: string;
  retest_instructions: string;
  suppressed_reason: string | null;
  suppressed_until: Date | null;
  suppressed_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createFindings(findings: Array<{
  workspace_id: string;
  audit_run_id: string;
  rule_id: string;
  rule_version: string;
  result: Finding['result'];
  severity: Finding['severity'];
  url?: string | null;
  occurrence_key?: string | null;
  title: string;
  description: string;
  remediation: string;
  retest_instructions: string;
}>): Promise<Finding[]> {
  if (findings.length === 0) return [];
  const sql = getDb();

  // Insert findings one at a time to avoid the "ON CONFLICT DO UPDATE command cannot affect
  // row a second time" error (PostgreSQL error 21000) when a batch contains two rows with
  // the same conflict key.  Sequential inserts with individual upserts are safe because each
  // conflict target (audit_run_id, rule_id, COALESCE(url,''), COALESCE(occurrence_key,''))
  // can only appear once in the table at any given time.
  const results: Finding[] = [];
  for (const finding of findings) {
    const [row] = await sql<Finding[]>`
      INSERT INTO findings ${sql({
        workspace_id: finding.workspace_id,
        audit_run_id: finding.audit_run_id,
        rule_id: finding.rule_id,
        rule_version: finding.rule_version,
        result: finding.result,
        severity: finding.severity,
        url: finding.url ?? null,
        occurrence_key: finding.occurrence_key ?? null,
        title: finding.title,
        description: finding.description,
        remediation: finding.remediation,
        retest_instructions: finding.retest_instructions,
      })}
      ON CONFLICT (audit_run_id, rule_id, COALESCE(url, ''), COALESCE(occurrence_key, '')) DO UPDATE SET
        rule_version = EXCLUDED.rule_version,
        result = EXCLUDED.result,
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        remediation = EXCLUDED.remediation,
        retest_instructions = EXCLUDED.retest_instructions,
        updated_at = NOW()
      RETURNING *
    `;
    if (row) results.push(row);
  }
  return results;
}

export async function getFindingsByAuditRun(auditRunId: string, workspaceId: string): Promise<Finding[]> {
  const sql = getDb();
  return sql<Finding[]>`
    SELECT * FROM findings
    WHERE audit_run_id = ${auditRunId} AND workspace_id = ${workspaceId}
    ORDER BY
      CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      created_at ASC
  `;
}
