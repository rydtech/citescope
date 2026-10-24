import { requireAuth } from '@/lib/auth';
import { getProjectById, getAuditRunsByProject, requireWorkspaceMember } from '@citescope/database';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StartAuditButton } from './StartAuditButton';

export default async function ProjectPage({ params }: { params: { workspaceId: string; projectId: string } }) {
  const user = await requireAuth();
  const membership = await requireWorkspaceMember(params.workspaceId, user.id).catch(() => null);
  if (!membership) notFound();
  const project = await getProjectById(params.projectId, params.workspaceId).catch(() => null);
  if (!project) notFound();

  const audits = await getAuditRunsByProject(params.projectId, params.workspaceId).catch(() => []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm text-gray-500 mb-1">
            <Link href={`/dashboard/workspaces/${params.workspaceId}`} className="hover:underline">Workspace</Link>
            {' / '}
            {project.display_name}
          </div>
          <h1 className="text-2xl font-bold">{project.display_name}</h1>
          <p className="text-sm text-gray-500 mt-1">{project.domain}</p>
        </div>
        <StartAuditButton workspaceId={params.workspaceId} projectId={params.projectId} />
      </div>

      <h2 className="text-lg font-semibold mb-4">Audit runs</h2>

      {audits.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No audits yet. Start your first audit above.</div>
      ) : (
        <div className="space-y-3">
          {audits.map(run => (
            <Link
              key={run.id}
              href={`/dashboard/workspaces/${params.workspaceId}/projects/${params.projectId}/audits/${run.id}`}
              className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-500 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
                    run.state === 'completed' ? 'bg-green-100 text-green-700' :
                    run.state === 'failed' ? 'bg-red-100 text-red-700' :
                    run.state === 'running' ? 'bg-blue-100 text-blue-700' :
                    run.state === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{run.state}</span>
                  <span className="ml-3 text-sm text-gray-500">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  {run.pages_fetched}/{run.max_pages} pages
                </div>
              </div>
              {run.failure_reason && (
                <p className="mt-2 text-sm text-red-600">{run.failure_reason}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
