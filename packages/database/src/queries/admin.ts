import { getDb } from '../client.js';

export interface PlatformAdminGrant {
  id: string;
  user_id: string;
  user_email: string;
  is_active: boolean;
  granted_by: string | null;
  granted_at: Date;
  revoked_by: string | null;
  revoked_at: Date | null;
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT 1 FROM platform_admin_grants
    WHERE user_id = ${userId} AND is_active = TRUE LIMIT 1
  `;
  return rows.length > 0;
}

export async function grantPlatformAdmin(data: {
  user_id: string;
  user_email: string;
  granted_by: string | null;
  notes?: string;
}): Promise<PlatformAdminGrant> {
  const sql = getDb();
  const [grant] = await sql<PlatformAdminGrant[]>`
    INSERT INTO platform_admin_grants (user_id, user_email, granted_by, notes)
    VALUES (${data.user_id}, ${data.user_email}, ${data.granted_by}, ${data.notes ?? null})
    ON CONFLICT (user_id) DO UPDATE SET is_active = TRUE, granted_at = NOW()
    RETURNING *
  `;
  return grant!;
}

export async function revokePlatformAdmin(userId: string, revokedBy: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE platform_admin_grants
    SET is_active = FALSE, revoked_by = ${revokedBy}, revoked_at = NOW()
    WHERE user_id = ${userId}
  `;
}

export async function logAdminActivity(data: {
  actor_id: string;
  actor_email: string;
  action: string;
  target_type?: string;
  target_id?: string;
  target_workspace_id?: string | null;
  reason?: string;
  request_id?: string;
  outcome?: string;
  before_value?: Record<string, unknown> | null;
  after_value?: Record<string, unknown> | null;
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO admin_activity_log (
      actor_id, actor_email, action, target_type, target_id,
      target_workspace_id, reason, request_id, outcome, before_value, after_value
    ) VALUES (
      ${data.actor_id}, ${data.actor_email}, ${data.action},
      ${data.target_type ?? null}, ${data.target_id ?? null},
      ${data.target_workspace_id ?? null}, ${data.reason ?? null},
      ${data.request_id ?? null}, ${data.outcome ?? 'success'},
      ${data.before_value ? sql.json(data.before_value as never) : null},
      ${data.after_value ? sql.json(data.after_value as never) : null}
    )
  `;
}

export interface AdminOverviewStats {
  total_users: number;
  total_workspaces: number;
  active_workspaces: number;
  completed_audits: number;
  failed_audits: number;
  partial_audits: number;
  queued_audits: number;
}

export async function getAdminOverviewStats(since: Date): Promise<AdminOverviewStats> {
  const sql = getDb();
  const [stats] = await sql<AdminOverviewStats[]>`
    SELECT
      (SELECT COUNT(DISTINCT user_id) FROM workspace_memberships)::int AS total_users,
      (SELECT COUNT(*) FROM workspaces)::int AS total_workspaces,
      (SELECT COUNT(DISTINCT workspace_id) FROM audit_runs
       WHERE created_at >= ${since} AND state IN ('completed','partial','running'))::int AS active_workspaces,
      (SELECT COUNT(*) FROM audit_runs WHERE state = 'completed' AND created_at >= ${since})::int AS completed_audits,
      (SELECT COUNT(*) FROM audit_runs WHERE state = 'failed' AND created_at >= ${since})::int AS failed_audits,
      (SELECT COUNT(*) FROM audit_runs WHERE state = 'partial' AND created_at >= ${since})::int AS partial_audits,
      (SELECT COUNT(*) FROM audit_runs WHERE state = 'queued')::int AS queued_audits
  `;
  return stats!;
}

export async function getAdminActivityLog(opts: {
  limit: number;
  offset: number;
  actorId?: string;
  targetWorkspaceId?: string;
}): Promise<{ entries: Array<Record<string, unknown>>; total: number }> {
  const sql = getDb();
  const entries = await sql`
    SELECT * FROM admin_activity_log
    WHERE
      ${opts.actorId ? sql`actor_id = ${opts.actorId}` : sql`TRUE`}
      AND ${opts.targetWorkspaceId ? sql`target_workspace_id = ${opts.targetWorkspaceId}` : sql`TRUE`}
    ORDER BY created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `;
  const [{ count }] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM admin_activity_log
    WHERE
      ${opts.actorId ? sql`actor_id = ${opts.actorId}` : sql`TRUE`}
      AND ${opts.targetWorkspaceId ? sql`target_workspace_id = ${opts.targetWorkspaceId}` : sql`TRUE`}
  `;
  return { entries: entries as Array<Record<string, unknown>>, total: count };
}
