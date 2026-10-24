-- Migration 005: evidence artifact deduplication constraint.
-- Prevents duplicate evidence artifacts when a BullMQ job is retried.
-- The unique key is: (audit_run_id, rule_id, page_id, extraction_mode, md5(excerpt))
-- NULL values are coalesced so they compare equal and participate in the constraint.
--
-- Note: page_id can be NULL (for site-level evidence); rule_id can be NULL.
-- excerpt is stored outside the index key; we hash it with md5() to produce a bounded
-- 32-character hex digest. This prevents PostgreSQL error 54000 (index row size exceeded)
-- when evidence excerpts contain long titles, URLs, or multi-line content.

CREATE UNIQUE INDEX IF NOT EXISTS evidence_artifacts_dedup
  ON evidence_artifacts (
    audit_run_id,
    COALESCE(rule_id, ''),
    COALESCE(page_id::text, ''),
    extraction_mode,
    md5(COALESCE(excerpt, ''))
  );
