import { getDb } from '../client.js';

export interface Project {
  id: string;
  workspace_id: string;
  domain: string;
  canonical_url: string | null;
  display_name: string;
  business_description: string | null;
  target_audience: string | null;
  priority_urls: string[];
  excluded_paths: string[];
  authorization_method: 'domain_verification' | 'agency_authorization';
  authorization_actor: string;
  authorization_at: Date;
  is_active: boolean;
  created_at: Date;
}

export async function createProject(data: Omit<Project, 'id' | 'created_at' | 'is_active'>): Promise<Project> {
  const sql = getDb();
  const [project] = await sql<Project[]>`
    INSERT INTO projects ${sql({
      ...data,
      priority_urls: sql.json(data.priority_urls),
      excluded_paths: sql.json(data.excluded_paths),
    })}
    RETURNING *
  `;
  return project!;
}

export async function getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
  const sql = getDb();
  return sql<Project[]>`
    SELECT * FROM projects WHERE workspace_id = ${workspaceId} ORDER BY created_at ASC
  `;
}

export async function getProjectById(id: string, workspaceId: string): Promise<Project | null> {
  const sql = getDb();
  const rows = await sql<Project[]>`
    SELECT * FROM projects WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
  `;
  return rows[0] ?? null;
}
