import { getDb } from '../client.js';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  is_suspended: boolean;
  suspension_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function getWorkspaceById(id: string): Promise<Workspace | null> {
  const sql = getDb();
  const rows = await sql<Workspace[]>`SELECT * FROM workspaces WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
  const sql = getDb();
  return sql<Workspace[]>`
    SELECT w.* FROM workspaces w
    JOIN workspace_memberships m ON m.workspace_id = w.id
    WHERE m.user_id = ${userId}
    ORDER BY w.created_at ASC
  `;
}

export async function createWorkspace(data: {
  name: string;
  slug: string;
  owner_id: string;
}): Promise<Workspace> {
  const sql = getDb();
  const rows = await sql.begin(async (tx) => {
    const ws = await tx<Workspace[]>`
      INSERT INTO workspaces (name, slug) VALUES (${data.name}, ${data.slug}) RETURNING *
    `;
    await tx`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES (${ws[0]!.id}, ${data.owner_id}, 'owner')
    `;
    await tx`
      INSERT INTO workspace_quotas (workspace_id) VALUES (${ws[0]!.id})
      ON CONFLICT DO NOTHING
    `;
    return ws;
  });
  return rows[0]!;
}

export async function requireWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<{ workspace_id: string; user_id: string; role: string } | null> {
  const sql = getDb();
  const rows = await sql<{ workspace_id: string; user_id: string; role: string }[]>`
    SELECT workspace_id, user_id, role
    FROM workspace_memberships
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getAllWorkspacesPaginated(opts: {
  limit: number;
  offset: number;
  search?: string;
}): Promise<{ workspaces: (Workspace & { member_count: number; project_count: number; audit_count: number })[]; total: number }> {
  const sql = getDb();
  const searchClause = opts.search ? `%${opts.search}%` : null;
  const workspaces = await sql<(Workspace & { member_count: number; project_count: number; audit_count: number })[]>`
    SELECT w.*,
      (SELECT COUNT(*) FROM workspace_memberships WHERE workspace_id = w.id)::int AS member_count,
      (SELECT COUNT(*) FROM projects WHERE workspace_id = w.id)::int AS project_count,
      (SELECT COUNT(*) FROM audit_runs WHERE workspace_id = w.id)::int AS audit_count
    FROM workspaces w
    WHERE ${searchClause ? sql`w.name ILIKE ${searchClause} OR w.slug ILIKE ${searchClause}` : sql`TRUE`}
    ORDER BY w.created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `;
  const [{ count }] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM workspaces w
    WHERE ${searchClause ? sql`w.name ILIKE ${searchClause} OR w.slug ILIKE ${searchClause}` : sql`TRUE`}
  `;
  return { workspaces, total: count };
}
