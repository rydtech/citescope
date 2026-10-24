import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createProject, getWorkspaceById, requireWorkspaceMember } from '@citescope/database';
import { CreateProjectRequestSchema } from '@citescope/contracts';
import { fetchPage } from '@citescope/crawler';

// Probe the domain using the hardened crawler transport (safe HTTP agent with connection-time
// DNS validation). This ensures SSRF protection and DNS rebinding prevention apply at the
// actual TCP connection level — native fetch cannot provide this guarantee because it resolves
// DNS independently from any pre-flight check.
async function probeCanonicalUrl(domain: string): Promise<string | null> {
  for (const scheme of ['https', 'http'] as const) {
    const url = `${scheme}://${domain}/`;
    try {
      const result = await fetchPage(url, { timeoutMs: 5000, maxRedirects: 3 });
      if (!result.fetchError && result.httpStatus !== null && result.httpStatus < 400) {
        return url;
      }
    } catch {
      // try next scheme
    }
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspace = await getWorkspaceById(params.workspaceId).catch(() => null);
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const membership = await requireWorkspaceMember(params.workspaceId, session.user_id).catch(() => null);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = CreateProjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 });
  }

  const canonical_url = await probeCanonicalUrl(parsed.data.domain);

  try {
    const project = await createProject({
      workspace_id: params.workspaceId,
      domain: parsed.data.domain,
      canonical_url,
      display_name: parsed.data.display_name,
      business_description: parsed.data.business_description ?? null,
      target_audience: null,
      priority_urls: parsed.data.priority_urls ?? [],
      excluded_paths: parsed.data.excluded_paths ?? [],
      authorization_method: parsed.data.authorization_method,
      authorization_actor: session.user_id,
      authorization_at: new Date(),
    });
    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
