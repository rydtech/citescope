import { getDb } from '../client.js';

export interface AuditRun {
  id: string;
  workspace_id: string;
  project_id: string;
  state: 'queued' | 'running' | 'partial' | 'completed' | 'failed' | 'canceled';
  config_snapshot: Record<string, unknown>;
  rule_versions: Record<string, string>;
  max_pages: number;
  max_rendered_pages: number;
  pages_discovered: number;
  pages_fetched: number;
  pages_blocked: number;
  pages_failed: number;
  pages_excluded: number;
  pages_evaluated: number;
  started_at: Date | null;
  completed_at: Date | null;
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createAuditRun(data: {
  workspace_id: string;
  project_id: string;
  max_pages?: number;
  config_snapshot?: Record<string, unknown>;
}): Promise<AuditRun> {
  const sql = getDb();
  const [run] = await sql<AuditRun[]>`
    INSERT INTO audit_runs (workspace_id, project_id, max_pages, config_snapshot)
    VALUES (${data.workspace_id}, ${data.project_id}, ${data.max_pages ?? 500}, ${sql.json((data.config_snapshot ?? {}) as never)})
    RETURNING *
  `;
  return run!;
}

export async function getAuditRunById(id: string, workspaceId: string): Promise<AuditRun | null> {
  const sql = getDb();
  const rows = await sql<AuditRun[]>`
    SELECT * FROM audit_runs WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getAuditRunsByProject(projectId: string, workspaceId: string): Promise<AuditRun[]> {
  const sql = getDb();
  return sql<AuditRun[]>`
    SELECT * FROM audit_runs
    WHERE project_id = ${projectId} AND workspace_id = ${workspaceId}
    ORDER BY created_at DESC
  `;
}

export async function updateAuditRunState(
  id: string,
  state: AuditRun['state'],
  extra?: { failure_reason?: string }
): Promise<void> {
  const sql = getDb();
  const now = new Date();
  const isTerminal = ['completed', 'failed', 'canceled', 'partial'].includes(state);
  await sql`
    UPDATE audit_runs SET
      state = ${state},
      failure_reason = ${extra?.failure_reason ?? null},
      started_at = CASE WHEN state = 'queued' AND ${state} = 'running' THEN ${now} ELSE started_at END,
      completed_at = ${isTerminal ? now : null},
      updated_at = NOW()
    WHERE id = ${id}
  `;
  await sql`
    INSERT INTO audit_state_transitions (audit_run_id, to_state) VALUES (${id}, ${state})
  `;
}

export async function incrementAuditCounter(
  id: string,
  field: 'pages_discovered' | 'pages_fetched' | 'pages_blocked' | 'pages_failed' | 'pages_excluded' | 'pages_evaluated',
  by = 1
): Promise<void> {
  const sql = getDb();
  const allowed = ['pages_discovered', 'pages_fetched', 'pages_blocked', 'pages_failed', 'pages_excluded', 'pages_evaluated'];
  if (!allowed.includes(field)) throw new Error(`Invalid counter field: ${field}`);
  await sql.unsafe(
    `UPDATE audit_runs SET ${field} = ${field} + $1, updated_at = NOW() WHERE id = $2`,
    [by, id]
  );
}

/**
 * Transition an audit to 'running' only if it is currently in 'queued' state.
 * Returns true if the transition succeeded, false if the audit was not in 'queued'
 * state (e.g. already canceled, failed, or running on a retry).
 * This prevents a retried crawl job from clobbering a terminal state.
 */
export async function transitionAuditToRunning(id: string): Promise<boolean> {
  const sql = getDb();
  const now = new Date();
  const rows = await sql`
    UPDATE audit_runs SET
      state = 'running',
      started_at = ${now},
      updated_at = NOW()
    WHERE id = ${id} AND state = 'queued'
    RETURNING id
  `;
  if (rows.length > 0) {
    await sql`
      INSERT INTO audit_state_transitions (audit_run_id, to_state) VALUES (${id}, 'running')
    `;
    return true;
  }
  return false;
}

/**
 * Reconcile page counters for an audit run from the actual pages table.
 * Called at end of crawl to fix counters that may have been incremented
 * multiple times on retried jobs.
 */
export async function reconcileAuditCounters(id: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE audit_runs SET
      pages_discovered = (
        SELECT COUNT(*) FROM pages WHERE audit_run_id = ${id}
      ),
      pages_fetched = (
        SELECT COUNT(*) FROM pages
        WHERE audit_run_id = ${id}
          AND fetch_error IS NULL
          AND http_status IS NOT NULL
          AND http_status < 400
          AND (robots_directive IS NULL OR robots_directive != 'blocked_by_robots_txt')
      ),
      pages_failed = (
        SELECT COUNT(*) FROM pages
        WHERE audit_run_id = ${id}
          AND (fetch_error IS NOT NULL OR (http_status IS NOT NULL AND http_status >= 400))
      ),
      pages_blocked = (
        SELECT COUNT(*) FROM pages
        WHERE audit_run_id = ${id} AND robots_directive = 'blocked_by_robots_txt'
      ),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function getAllAuditRunsPaginated(opts: {
  limit: number;
  offset: number;
  workspaceId?: string;
  state?: string;
}): Promise<{ runs: AuditRun[]; total: number }> {
  const sql = getDb();
  const runs = await sql<AuditRun[]>`
    SELECT * FROM audit_runs
    WHERE
      ${opts.workspaceId ? sql`workspace_id = ${opts.workspaceId}` : sql`TRUE`}
      AND ${opts.state ? sql`state = ${opts.state}` : sql`TRUE`}
    ORDER BY created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `;
  const [{ count }] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM audit_runs
    WHERE
      ${opts.workspaceId ? sql`workspace_id = ${opts.workspaceId}` : sql`TRUE`}
      AND ${opts.state ? sql`state = ${opts.state}` : sql`TRUE`}
  `;
  return { runs, total: count };
}
