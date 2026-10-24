-- Page extraction records: structured data extracted from HTML at crawl time.
-- Prevents rules handler from needing to reconstruct/re-parse HTML.
CREATE TABLE IF NOT EXISTS page_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  extraction_version TEXT NOT NULL DEFAULT '1.0',
  title TEXT,
  meta_robots TEXT,
  canonical_urls JSONB NOT NULL DEFAULT '[]',
  internal_links JSONB NOT NULL DEFAULT '[]',
  json_ld_blocks JSONB NOT NULL DEFAULT '[]',
  x_robots_tag TEXT,
  content_type TEXT,
  http_status INTEGER,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id)
);

CREATE INDEX IF NOT EXISTS idx_page_extractions_audit ON page_extractions(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_page_extractions_workspace ON page_extractions(workspace_id);
