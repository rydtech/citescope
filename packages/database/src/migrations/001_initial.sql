CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  suspension_reason TEXT,
  suspended_by UUID,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  display_name TEXT NOT NULL,
  business_description TEXT,
  target_audience TEXT,
  priority_urls JSONB NOT NULL DEFAULT '[]',
  excluded_paths JSONB NOT NULL DEFAULT '[]',
  authorization_method TEXT NOT NULL CHECK (authorization_method IN ('domain_verification','agency_authorization')),
  authorization_actor TEXT NOT NULL,
  authorization_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_workspace ON projects(workspace_id);

CREATE TABLE audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','partial','completed','failed','canceled')),
  config_snapshot JSONB NOT NULL DEFAULT '{}',
  rule_versions JSONB NOT NULL DEFAULT '{}',
  max_pages INTEGER NOT NULL DEFAULT 500,
  max_rendered_pages INTEGER NOT NULL DEFAULT 25,
  pages_discovered INTEGER NOT NULL DEFAULT 0,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  pages_blocked INTEGER NOT NULL DEFAULT 0,
  pages_failed INTEGER NOT NULL DEFAULT 0,
  pages_excluded INTEGER NOT NULL DEFAULT 0,
  pages_evaluated INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_runs_workspace ON audit_runs(workspace_id);
CREATE INDEX idx_audit_runs_project ON audit_runs(project_id);
CREATE INDEX idx_audit_runs_state ON audit_runs(state);

CREATE TABLE audit_state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  requested_url TEXT NOT NULL,
  final_url TEXT,
  http_status INTEGER,
  content_type TEXT,
  content_hash TEXT,
  redirect_chain JSONB NOT NULL DEFAULT '[]',
  robots_directive TEXT,
  canonical_url TEXT,
  title TEXT,
  meta_description TEXT,
  is_rendered BOOLEAN NOT NULL DEFAULT FALSE,
  fetch_duration_ms INTEGER,
  fetch_error TEXT,
  fetched_at TIMESTAMPTZ,
  raw_html_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pages_audit_run ON pages(audit_run_id);
CREATE INDEX idx_pages_workspace ON pages(workspace_id);

CREATE TABLE evidence_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  artifact_type TEXT NOT NULL,
  storage_ref TEXT,
  excerpt TEXT,
  selector TEXT,
  content_hash TEXT,
  extraction_mode TEXT NOT NULL DEFAULT 'http',
  rule_id TEXT,
  expires_at TIMESTAMPTZ,
  is_redacted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_audit_run ON evidence_artifacts(audit_run_id);
CREATE INDEX idx_evidence_workspace ON evidence_artifacts(workspace_id);

CREATE TABLE rule_registry (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high','medium','low','advisory')),
  unit_type TEXT NOT NULL CHECK (unit_type IN ('page','link','site')),
  weight INTEGER NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES rule_registry(id),
  rule_version TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','fail','review','not_applicable','unknown')),
  severity TEXT NOT NULL CHECK (severity IN ('high','medium','low','advisory')),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','in_progress','resolved','accepted_risk','suppressed')),
  url TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  remediation TEXT NOT NULL,
  retest_instructions TEXT NOT NULL,
  suppressed_reason TEXT,
  suppressed_until TIMESTAMPTZ,
  suppressed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_findings_audit_run ON findings(audit_run_id);
CREATE INDEX idx_findings_workspace ON findings(workspace_id);
CREATE INDEX idx_findings_rule ON findings(rule_id);

CREATE TABLE finding_evidence (
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence_artifacts(id) ON DELETE CASCADE,
  PRIMARY KEY (finding_id, evidence_id)
);

CREATE TABLE remediation_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  actor UUID NOT NULL,
  action TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_run_id UUID REFERENCES audit_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_reservation BOOLEAN NOT NULL DEFAULT FALSE,
  is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_workspace ON usage_events(workspace_id);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_unpublished ON outbox_events(published, created_at) WHERE published = FALSE;

CREATE TABLE workspace_quotas (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  max_audits_per_month INTEGER NOT NULL DEFAULT 10,
  max_pages_per_audit INTEGER NOT NULL DEFAULT 500,
  max_rendered_pages_per_audit INTEGER NOT NULL DEFAULT 25,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

CREATE TABLE platform_admin_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  user_email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  reason TEXT,
  request_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_activity_actor ON admin_activity_log(actor_id);
CREATE INDEX idx_admin_activity_target ON admin_activity_log(target_workspace_id);
CREATE INDEX idx_admin_activity_created ON admin_activity_log(created_at DESC);

INSERT INTO rule_registry (id, version, category, title, description, severity, unit_type, weight) VALUES
('SEO001', '1.0.0', 'technical', 'Failed fetch of expected public page', 'HTTP fetch returned an error or unexpected status', 'high', 'page', 3),
('SEO002', '1.0.0', 'technical', 'Broken internal link target', 'An internal link points to a non-2xx URL', 'medium', 'link', 2),
('SEO003', '1.0.0', 'technical', 'Redirect loop or exceeded redirect budget', 'Redirect chain loops or exceeds limit', 'high', 'page', 3),
('SEO004', '1.0.0', 'technical', 'Crawler denied by robots policy', 'Page blocked by robots.txt or meta robots', 'low', 'page', 1),
('SEO005', '1.0.0', 'technical', 'Noindex directive on page intended for search', 'Page carries noindex but is not excluded', 'high', 'page', 3),
('SEO006', '1.0.0', 'technical', 'Empty or missing title element', 'Title element absent or empty', 'medium', 'page', 2),
('SEO007', '1.0.0', 'technical', 'Duplicate title across evaluated pages', 'Two or more pages share identical title', 'medium', 'page', 2),
('SEO008', '1.0.0', 'technical', 'Conflicting canonical declarations', 'Multiple different canonical URLs declared', 'medium', 'page', 2),
('SEO009', '1.0.0', 'technical', 'Invalid JSON-LD syntax', 'JSON-LD block contains JSON syntax error', 'low', 'page', 1),
('SEO010', '1.0.0', 'technical', 'Sitemap-listed URL contradicts search intent', 'Sitemap URL carries noindex directive', 'medium', 'page', 2);

-- ============================================================
-- LOCAL AUTH (replaces Supabase Auth for local dev)
-- ============================================================
CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
