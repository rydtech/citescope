import { getDb } from '../client.js';

export interface PageExtraction {
  id: string;
  page_id: string;
  workspace_id: string;
  audit_run_id: string;
  extraction_version: string;
  title: string | null;
  meta_robots: string | null;
  canonical_urls: string[];
  internal_links: Array<{ href: string }>;
  json_ld_blocks: string[];
  x_robots_tag: string | null;
  content_type: string | null;
  http_status: number | null;
  extracted_at: Date;
}

export async function insertPageExtraction(data: Omit<PageExtraction, 'id' | 'extracted_at'>): Promise<PageExtraction> {
  const sql = getDb();
  const [row] = await sql<PageExtraction[]>`
    INSERT INTO page_extractions ${sql({
      ...data,
      canonical_urls: sql.json(data.canonical_urls),
      internal_links: sql.json(data.internal_links),
      json_ld_blocks: sql.json(data.json_ld_blocks),
    })}
    ON CONFLICT (page_id) DO UPDATE SET
      title = EXCLUDED.title,
      meta_robots = EXCLUDED.meta_robots,
      canonical_urls = EXCLUDED.canonical_urls,
      internal_links = EXCLUDED.internal_links,
      json_ld_blocks = EXCLUDED.json_ld_blocks,
      x_robots_tag = EXCLUDED.x_robots_tag,
      content_type = EXCLUDED.content_type,
      http_status = EXCLUDED.http_status,
      extraction_version = EXCLUDED.extraction_version,
      extracted_at = NOW()
    RETURNING *
  `;
  return row!;
}

export async function getExtractionsByAuditRun(auditRunId: string, workspaceId: string): Promise<PageExtraction[]> {
  const sql = getDb();
  return sql<PageExtraction[]>`
    SELECT * FROM page_extractions
    WHERE audit_run_id = ${auditRunId} AND workspace_id = ${workspaceId}
    ORDER BY extracted_at ASC
  `;
}
