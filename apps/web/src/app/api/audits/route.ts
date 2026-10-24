import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@citescope/database';
import { StartAuditRequestSchema } from '@citescope/contracts';
import { RULE_VERSIONS } from '@citescope/audit-rules';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = StartAuditRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 });
  }

  const sql = getDb();

  const [memberRow] = await sql`
    SELECT p.*, wm.workspace_id
    FROM projects p
    JOIN workspace_memberships wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = ${parsed.data.project_id} AND wm.user_id = ${session.user_id}
    LIMIT 1
  `;
  if (!memberRow) return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });

  const [ws] = await sql`SELECT is_suspended FROM workspaces WHERE id = ${memberRow.workspace_id} LIMIT 1`;
  if (ws?.is_suspended) {
    return NextResponse.json({ error: 'Workspace is suspended. New audits are blocked.' }, { status: 403 });
  }

  const [running] = await sql`
    SELECT 1 FROM audit_runs
    WHERE project_id = ${parsed.data.project_id} AND state IN ('queued','running')
    LIMIT 1
  `;
  if (running) {
    return NextResponse.json({ error: 'An audit is already in progress for this project' }, { status: 409 });
  }

  const project = memberRow as { id: string; workspace_id: string; domain: string; canonical_url: string | null; excluded_paths: string[] };
  const start_url = project.canonical_url ?? `http://${project.domain}/`;

  try {
    const { id: runId, state } = await sql.begin(async (tx) => {
      const [run] = await tx<{ id: string; state: string; max_pages: number }[]>`
        INSERT INTO audit_runs (workspace_id, project_id, max_pages, config_snapshot)
        VALUES (
          ${project.workspace_id}, ${project.id},
          ${parsed.data.max_pages ?? 500},
          ${sql.json({ rule_versions: RULE_VERSIONS } as never)}
        )
        RETURNING id, state, max_pages
      `;
      if (!run) throw new Error('Failed to create audit run');

      await tx`
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          'audit_run', ${run.id}, 'audit.start',
          ${sql.json({
            audit_run_id: run.id,
            workspace_id: project.workspace_id,
            project_id: project.id,
            domain: project.domain,
            start_url,
            max_pages: run.max_pages,
            excluded_paths: project.excluded_paths ?? [],
          } as never)}
        )
      `;
      return run;
    });

    return NextResponse.json({ id: runId, state }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to start audit' }, { status: 500 });
  }
}
