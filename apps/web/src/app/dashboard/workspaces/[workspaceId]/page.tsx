import { requireAuth } from '@/lib/auth';
import { getWorkspaceById, getProjectsByWorkspace, requireWorkspaceMember } from '@citescope/database';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function WorkspacePage({ params }: { params: { workspaceId: string } }) {
  const user = await requireAuth();
  const workspace = await getWorkspaceById(params.workspaceId).catch(() => null);
  if (!workspace) notFound();

  const membership = await requireWorkspaceMember(params.workspaceId, user.id).catch(() => null);
  if (!membership) notFound();

  const projects = await getProjectsByWorkspace(params.workspaceId).catch(() => []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{workspace.name}</h1>
          {workspace.is_suspended && (
            <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
              Suspended — new audits are blocked
            </span>
          )}
        </div>
        <Link
          href={`/dashboard/workspaces/${workspace.id}/projects/new`}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          Add project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="mb-4">No projects yet.</p>
          <Link href={`/dashboard/workspaces/${workspace.id}/projects/new`} className="text-brand-600 hover:underline">
            Add your first project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map(p => (
            <Link
              key={p.id}
              href={`/dashboard/workspaces/${workspace.id}/projects/${p.id}`}
              className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-500 transition-colors"
            >
              <h2 className="font-semibold">{p.display_name}</h2>
              <p className="text-sm text-gray-500 mt-1">{p.domain}</p>
              <p className="text-xs text-gray-400 mt-1">
                Auth: {p.authorization_method === 'domain_verification' ? 'Domain verification' : 'Agency authorization'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
