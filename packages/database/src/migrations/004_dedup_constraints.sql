-- Migration 004: deduplication constraints and occurrence_key for per-occurrence findings
-- Rewritten to use valid PostgreSQL syntax (CREATE UNIQUE INDEX with expressions).
--
-- occurrence_key allows rules that emit multiple findings per page/rule pair
-- (e.g., SEO002 broken links, SEO009 JSON-LD blocks) to be uniquely identified.

-- Add occurrence_key column to findings (nullable; NULL = single finding per page/rule)
ALTER TABLE findings ADD COLUMN IF NOT EXISTS occurrence_key TEXT;

-- Unique page attempts per audit.
-- Use a unique index (not a constraint) so it can be created idempotently with IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS pages_audit_url_unique
  ON pages (audit_run_id, requested_url);

-- Per-occurrence finding identity.
-- COALESCE maps NULL url/occurrence_key to '' so NULLs compare equal (stable upsert key).
-- ON CONFLICT in findings.ts targets this index.
CREATE UNIQUE INDEX IF NOT EXISTS findings_occurrence_unique
  ON findings (audit_run_id, rule_id, COALESCE(url, ''), COALESCE(occurrence_key, ''));

-- Prevent overlapping active audits per project at the DB level.
-- Only one audit in (queued, running) state may exist per project at a time.
CREATE UNIQUE INDEX IF NOT EXISTS audit_runs_one_active_per_project
  ON audit_runs (project_id)
  WHERE state IN ('queued', 'running');
