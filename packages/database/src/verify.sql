-- Migration verification script.
-- Run against an ISOLATED TEST database (not production) to verify that all migrations
-- apply cleanly and the resulting schema is correct.
--
-- Prerequisites:
--   1. Create a fresh PostgreSQL database: CREATE DATABASE citescope_verify;
--   2. Apply migrations in order:
--        psql citescope_verify < 001_initial.sql
--        psql citescope_verify < 002_project_canonical_url.sql
--        psql citescope_verify < 003_page_extractions.sql
--        psql citescope_verify < 004_dedup_constraints.sql
--   3. Run this file: psql citescope_verify < verify.sql
--
-- Before running on production, audit for:
--   a) Duplicate (audit_run_id, requested_url) in pages:
--        SELECT audit_run_id, requested_url, COUNT(*) FROM pages
--        GROUP BY audit_run_id, requested_url HAVING COUNT(*) > 1;
--   b) Duplicate (audit_run_id, rule_id, COALESCE(url,''), COALESCE(occurrence_key,'')) in findings:
--        SELECT audit_run_id, rule_id, COALESCE(url,''), COALESCE(occurrence_key,''), COUNT(*)
--        FROM findings
--        GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;
--   c) Overlapping active audits per project:
--        SELECT project_id, COUNT(*) FROM audit_runs
--        WHERE state IN ('queued','running')
--        GROUP BY project_id HAVING COUNT(*) > 1;
--   Resolve any duplicates before applying 004 or the unique index creation will fail.

-- ============================================================
-- 1. Verify tables exist
-- ============================================================
DO $$
BEGIN
  -- Core tables from 001_initial.sql
  ASSERT (SELECT to_regclass('public.workspaces') IS NOT NULL), 'workspaces table missing';
  ASSERT (SELECT to_regclass('public.workspace_memberships') IS NOT NULL), 'workspace_memberships table missing';
  ASSERT (SELECT to_regclass('public.projects') IS NOT NULL), 'projects table missing';
  ASSERT (SELECT to_regclass('public.audit_runs') IS NOT NULL), 'audit_runs table missing';
  ASSERT (SELECT to_regclass('public.audit_state_transitions') IS NOT NULL), 'audit_state_transitions table missing';
  ASSERT (SELECT to_regclass('public.pages') IS NOT NULL), 'pages table missing';
  ASSERT (SELECT to_regclass('public.evidence_artifacts') IS NOT NULL), 'evidence_artifacts table missing';
  ASSERT (SELECT to_regclass('public.findings') IS NOT NULL), 'findings table missing';
  ASSERT (SELECT to_regclass('public.finding_evidence') IS NOT NULL), 'finding_evidence table missing';
  ASSERT (SELECT to_regclass('public.usage_events') IS NOT NULL), 'usage_events table missing';
  -- Auth tables
  ASSERT (SELECT to_regclass('public.auth_users') IS NOT NULL), 'auth_users table missing';
  ASSERT (SELECT to_regclass('public.auth_sessions') IS NOT NULL), 'auth_sessions table missing';
  -- Admin tables
  ASSERT (SELECT to_regclass('public.platform_admin_grants') IS NOT NULL), 'platform_admin_grants table missing';
  ASSERT (SELECT to_regclass('public.platform_admin_activity') IS NOT NULL), 'platform_admin_activity table missing';
  -- From 003
  ASSERT (SELECT to_regclass('public.page_extractions') IS NOT NULL), 'page_extractions table missing';
  RAISE NOTICE 'All tables present.';
END $$;

-- ============================================================
-- 2. Verify columns added by 002 and 004
-- ============================================================
DO $$
BEGIN
  -- 002: canonical_url on projects
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'canonical_url'
  ), 'projects.canonical_url column missing (migration 002)';

  -- 004: occurrence_key on findings
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'findings' AND column_name = 'occurrence_key'
  ), 'findings.occurrence_key column missing (migration 004)';

  RAISE NOTICE 'All expected columns present.';
END $$;

-- ============================================================
-- 3. Verify indexes from 003 and 004
-- ============================================================
DO $$
BEGIN
  -- 003 indexes
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_page_extractions_audit'
  ), 'idx_page_extractions_audit index missing (migration 003)';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_page_extractions_workspace'
  ), 'idx_page_extractions_workspace index missing (migration 003)';

  -- 004 indexes
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'pages_audit_url_unique'
  ), 'pages_audit_url_unique index missing (migration 004)';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'findings_occurrence_unique'
  ), 'findings_occurrence_unique index missing (migration 004)';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'audit_runs_one_active_per_project'
  ), 'audit_runs_one_active_per_project index missing (migration 004)';

  RAISE NOTICE 'All expected indexes present.';
END $$;

-- ============================================================
-- 4. Functional test: UNIQUE constraints behave as intended
-- ============================================================

-- 4a. Test pages_audit_url_unique: two pages with same audit_run_id + requested_url should conflict
DO $$
DECLARE
  ws_id UUID := gen_random_uuid();
  proj_id UUID := gen_random_uuid();
  run_id UUID := gen_random_uuid();
  conflict_caught BOOLEAN := FALSE;
BEGIN
  INSERT INTO workspaces (id, name, slug) VALUES (ws_id, 'verify-ws', 'verify-ws');
  INSERT INTO projects (id, workspace_id, domain, display_name, authorization_method, authorization_actor, authorization_at)
    VALUES (proj_id, ws_id, 'example.com', 'Verify', 'owner_consent', 'system', NOW());
  INSERT INTO audit_runs (id, workspace_id, project_id) VALUES (run_id, ws_id, proj_id);
  INSERT INTO pages (workspace_id, audit_run_id, requested_url, is_rendered, fetch_duration_ms)
    VALUES (ws_id, run_id, 'https://example.com/', false, 0);
  BEGIN
    INSERT INTO pages (workspace_id, audit_run_id, requested_url, is_rendered, fetch_duration_ms)
      VALUES (ws_id, run_id, 'https://example.com/', false, 0);
  EXCEPTION WHEN unique_violation THEN
    conflict_caught := TRUE;
  END;
  ASSERT conflict_caught, 'pages_audit_url_unique did not enforce uniqueness';
  ROLLBACK;
END $$;

-- 4b. Test findings_occurrence_unique: two findings with same key should conflict (or upsert)
DO $$
DECLARE
  ws_id UUID := gen_random_uuid();
  proj_id UUID := gen_random_uuid();
  run_id UUID := gen_random_uuid();
  conflict_caught BOOLEAN := FALSE;
BEGIN
  INSERT INTO workspaces (id, name, slug) VALUES (ws_id, 'verify-ws2', 'verify-ws2');
  INSERT INTO projects (id, workspace_id, domain, display_name, authorization_method, authorization_actor, authorization_at)
    VALUES (proj_id, ws_id, 'example2.com', 'Verify2', 'owner_consent', 'system', NOW());
  INSERT INTO audit_runs (id, workspace_id, project_id) VALUES (run_id, ws_id, proj_id);
  INSERT INTO findings (workspace_id, audit_run_id, rule_id, rule_version, result, severity, title, description, remediation, retest_instructions)
    VALUES (ws_id, run_id, 'SEO001', '1.0.0', 'pass', 'high', 'T', 'D', 'R', 'RT');
  BEGIN
    INSERT INTO findings (workspace_id, audit_run_id, rule_id, rule_version, result, severity, title, description, remediation, retest_instructions)
      VALUES (ws_id, run_id, 'SEO001', '1.0.0', 'fail', 'high', 'T2', 'D2', 'R2', 'RT2');
  EXCEPTION WHEN unique_violation THEN
    conflict_caught := TRUE;
  END;
  ASSERT conflict_caught, 'findings_occurrence_unique did not enforce uniqueness for NULL url/occurrence_key';
  ROLLBACK;
END $$;

-- 4c. Test audit_runs_one_active_per_project
DO $$
DECLARE
  ws_id UUID := gen_random_uuid();
  proj_id UUID := gen_random_uuid();
  run1_id UUID := gen_random_uuid();
  conflict_caught BOOLEAN := FALSE;
BEGIN
  INSERT INTO workspaces (id, name, slug) VALUES (ws_id, 'verify-ws3', 'verify-ws3');
  INSERT INTO projects (id, workspace_id, domain, display_name, authorization_method, authorization_actor, authorization_at)
    VALUES (proj_id, ws_id, 'example3.com', 'Verify3', 'owner_consent', 'system', NOW());
  INSERT INTO audit_runs (id, workspace_id, project_id, state) VALUES (run1_id, ws_id, proj_id, 'queued');
  BEGIN
    INSERT INTO audit_runs (id, workspace_id, project_id, state) VALUES (gen_random_uuid(), ws_id, proj_id, 'running');
  EXCEPTION WHEN unique_violation THEN
    conflict_caught := TRUE;
  END;
  ASSERT conflict_caught, 'audit_runs_one_active_per_project did not prevent two active audits';
  ROLLBACK;
END $$;

RAISE NOTICE 'All migration verification checks passed.';
