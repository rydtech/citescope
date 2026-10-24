import { getDb } from '../client.js';

export interface EvidenceArtifact {
  id: string;
  workspace_id: string;
  audit_run_id: string;
  page_id: string | null;
  artifact_type: string;
  storage_ref: string | null;
  excerpt: string | null;
  selector: string | null;
  content_hash: string | null;
  extraction_mode: string;
  rule_id: string | null;
  expires_at: Date | null;
  is_redacted: boolean;
  created_at: Date;
}

export async function createEvidenceArtifact(data: Omit<EvidenceArtifact, 'id' | 'created_at'>): Promise<EvidenceArtifact> {
  const sql = getDb();
  // ON CONFLICT DO NOTHING with the evidence_artifacts_dedup index (migration 005):
  // if a duplicate artifact exists (same audit_run_id, rule_id, page_id, extraction_mode, md5(excerpt)),
  // skip the insert to prevent inflation on BullMQ job retries.
  // When the conflict fires and nothing is inserted, fetch the existing row to return it.
  // The index uses md5(COALESCE(excerpt,'')) to bound the index key size; the excerpt text
  // is stored in the row and queried directly for the fallback SELECT.
  const [artifact] = await sql<EvidenceArtifact[]>`
    INSERT INTO evidence_artifacts ${sql(data as never)}
    ON CONFLICT (
      audit_run_id,
      COALESCE(rule_id, ''),
      COALESCE(page_id::text, ''),
      extraction_mode,
      md5(COALESCE(excerpt, ''))
    )
    DO NOTHING
    RETURNING *
  `;
  if (artifact) return artifact;

  // The row already existed — fetch it so callers can link it to findings
  const [existing] = await sql<EvidenceArtifact[]>`
    SELECT * FROM evidence_artifacts
    WHERE audit_run_id = ${data.audit_run_id}
      AND COALESCE(rule_id, '') = ${data.rule_id ?? ''}
      AND COALESCE(page_id::text, '') = ${data.page_id ?? ''}
      AND extraction_mode = ${data.extraction_mode}
      AND COALESCE(excerpt, '') = ${data.excerpt ?? ''}
    LIMIT 1
  `;
  return existing!;
}

export async function linkEvidenceToFinding(findingId: string, evidenceId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO finding_evidence (finding_id, evidence_id) VALUES (${findingId}, ${evidenceId})
    ON CONFLICT DO NOTHING
  `;
}

export async function getEvidenceByFinding(findingId: string, workspaceId: string): Promise<EvidenceArtifact[]> {
  const sql = getDb();
  return sql<EvidenceArtifact[]>`
    SELECT ea.* FROM evidence_artifacts ea
    JOIN finding_evidence fe ON fe.evidence_id = ea.id
    WHERE fe.finding_id = ${findingId} AND ea.workspace_id = ${workspaceId}
  `;
}
