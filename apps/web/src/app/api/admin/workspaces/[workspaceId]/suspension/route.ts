import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isPlatformAdmin, getDb, logAdminActivity } from '@citescope/database';

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = await isPlatformAdmin(session.user_id);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let reason: string | null = null;
  let action: string | null = null;

  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({})) as { reason?: string; action?: string };
    reason = body.reason ?? null;
    action = body.action ?? null;
  } else {
    const formData = await req.formData().catch(() => null);
    reason = formData?.get('reason') as string ?? null;
    action = formData?.get('action') as string ?? null;
  }

  if (!reason?.trim()) return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  if (!['suspend', 'reactivate'].includes(action ?? '')) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const sql = getDb();
  const [ws] = await sql`SELECT id, is_suspended FROM workspaces WHERE id = ${params.workspaceId} LIMIT 1`;
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const beforeValue = { is_suspended: ws.is_suspended };
  const newSuspended = action === 'suspend';

  await sql`
    UPDATE workspaces SET
      is_suspended = ${newSuspended},
      suspension_reason = ${newSuspended ? reason : null},
      suspended_by = ${newSuspended ? session.user_id : null},
      suspended_at = ${newSuspended ? new Date() : null},
      updated_at = NOW()
    WHERE id = ${params.workspaceId}
  `;

  await logAdminActivity({
    actor_id: session.user_id,
    actor_email: session.email,
    action: action === 'suspend' ? 'workspace.suspend' : 'workspace.reactivate',
    target_type: 'workspace',
    target_id: params.workspaceId,
    target_workspace_id: params.workspaceId,
    reason,
    outcome: 'success',
    before_value: beforeValue,
    after_value: { is_suspended: newSuspended },
  });

  return NextResponse.redirect(new URL(`/admin/customers/${params.workspaceId}`, req.url));
}
