import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@citescope/database';

export async function GET(req: NextRequest, { params }: { params: { auditId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getDb();
  const [row] = await sql`
    SELECT ar.* FROM audit_runs ar
    JOIN workspace_memberships wm ON wm.workspace_id = ar.workspace_id
    WHERE ar.id = ${params.auditId} AND wm.user_id = ${session.user_id}
    LIMIT 1
  `;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}
