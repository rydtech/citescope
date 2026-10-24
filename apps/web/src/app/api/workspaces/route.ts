import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createWorkspace } from '@citescope/database';
import { CreateWorkspaceRequestSchema } from '@citescope/contracts';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateWorkspaceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 });
  }

  try {
    const workspace = await createWorkspace({ ...parsed.data, owner_id: session.user_id });
    return NextResponse.json(workspace, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('unique')) return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }
}
