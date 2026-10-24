import { getDb } from '../client.js';

export interface Page {
  id: string;
  workspace_id: string;
  audit_run_id: string;
  requested_url: string;
  final_url: string | null;
  http_status: number | null;
  content_type: string | null;
  content_hash: string | null;
  redirect_chain: string[];
  robots_directive: string | null;
  canonical_url: string | null;
  title: string | null;
  meta_description: string | null;
  is_rendered: boolean;
  fetch_duration_ms: number | null;
  fetch_error: string | null;
  fetched_at: Date | null;
  created_at: Date;
}

export async function insertPage(data: Omit<Page, 'id' | 'created_at'>): Promise<Page> {
  const sql = getDb();
  const [page] = await sql<Page[]>`
    INSERT INTO pages ${sql({
      ...data,
      redirect_chain: sql.json(data.redirect_chain),
    })}
    ON CONFLICT (audit_run_id, requested_url) DO UPDATE SET
      final_url = EXCLUDED.final_url,
      http_status = EXCLUDED.http_status,
      content_type = EXCLUDED.content_type,
      content_hash = EXCLUDED.content_hash,
      redirect_chain = EXCLUDED.redirect_chain,
      robots_directive = EXCLUDED.robots_directive,
      canonical_url = EXCLUDED.canonical_url,
      title = EXCLUDED.title,
      meta_description = EXCLUDED.meta_description,
      is_rendered = EXCLUDED.is_rendered,
      fetch_duration_ms = EXCLUDED.fetch_duration_ms,
      fetch_error = EXCLUDED.fetch_error,
      fetched_at = EXCLUDED.fetched_at
    RETURNING *
  `;
  return page!;
}

export async function getPagesByAuditRun(auditRunId: string, workspaceId: string): Promise<Page[]> {
  const sql = getDb();
  return sql<Page[]>`
    SELECT * FROM pages
    WHERE audit_run_id = ${auditRunId} AND workspace_id = ${workspaceId}
    ORDER BY created_at ASC
  `;
}
