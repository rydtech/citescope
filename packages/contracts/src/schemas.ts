import { z } from 'zod';

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  is_suspended: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  domain: z.string().min(1),
  display_name: z.string().min(1),
  business_description: z.string().nullable(),
  target_audience: z.string().nullable(),
  priority_urls: z.array(z.string()).default([]),
  excluded_paths: z.array(z.string()).default([]),
  authorization_method: z.enum(['domain_verification', 'agency_authorization']),
  authorization_actor: z.string(),
  authorization_at: z.string().datetime(),
  is_active: z.boolean().default(true),
  created_at: z.string().datetime(),
});

export const AuditRunSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid(),
  state: z.enum(['queued', 'running', 'partial', 'completed', 'failed', 'canceled']),
  config_snapshot: z.record(z.unknown()),
  rule_versions: z.record(z.string()),
  max_pages: z.number().int().positive().default(500),
  max_rendered_pages: z.number().int().positive().default(25),
  pages_discovered: z.number().int().default(0),
  pages_fetched: z.number().int().default(0),
  pages_blocked: z.number().int().default(0),
  pages_failed: z.number().int().default(0),
  pages_excluded: z.number().int().default(0),
  pages_evaluated: z.number().int().default(0),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  failure_reason: z.string().nullable(),
  created_at: z.string().datetime(),
});

export const StartAuditRequestSchema = z.object({
  project_id: z.string().uuid(),
  max_pages: z.number().int().min(1).max(500).optional(),
});

export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
});

export const CreateProjectRequestSchema = z.object({
  workspace_id: z.string().uuid(),
  domain: z.string().min(1),
  display_name: z.string().min(1),
  business_description: z.string().optional(),
  target_audience: z.string().optional(),
  priority_urls: z.array(z.string()).optional(),
  excluded_paths: z.array(z.string()).optional(),
  authorization_method: z.enum(['domain_verification', 'agency_authorization']),
});

export const CrawlJobPayloadSchema = z.object({
  audit_run_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid(),
  domain: z.string(),
  start_url: z.string().url(),
  max_pages: z.number().int().positive(),
  excluded_paths: z.array(z.string()),
});

export const RulesJobPayloadSchema = z.object({
  audit_run_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});

export const ReportJobPayloadSchema = z.object({
  audit_run_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});
