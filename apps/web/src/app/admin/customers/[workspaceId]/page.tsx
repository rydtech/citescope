import { requirePlatformAdmin } from '@/lib/admin-auth';
import { getDb, getProjectsByWorkspace } from '@citescope/database';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function AdminCustomerDetailPage({ params }: { params: { workspaceId: string } }) {
  await requirePlatformAdmin();

  const sql = getDb();
  const [workspace] = await sql`
    SELECT w.*, wq.max_audits_per_month, wq.max_pages_per_audit
    FROM workspaces w
    LEFT JOIN workspace_quotas wq ON wq.workspace_id = w.id
    WHERE w.id = ${params.workspaceId} LIMIT 1
  `;
  if (!workspace) notFound();

  const members = await sql`
    SELECT user_id, role, created_at FROM workspace_memberships WHERE workspace_id = ${params.workspaceId}
  `;
  const projects = await getProjectsByWorkspace(params.workspaceId).catch(() => []);

  const recentAudits = await sql`
    SELECT * FROM audit_runs WHERE workspace_id = ${params.workspaceId}
    ORDER BY created_at DESC LIMIT 10
  `;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/customers" className="text-sm text-gray-500 hover:underline">Customers</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold">{workspace.name as string}</h1>
        {workspace.is_suspended && (
          <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">Suspended</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Workspace details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">ID</dt><dd className="font-mono text-xs">{workspace.id as string}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Slug</dt><dd className="font-mono">{workspace.slug as string}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Created</dt><dd>{new Date(workspace.created_at as Date).toLocaleDateString()}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Max audits/mo</dt><dd>{workspace.max_audits_per_month as number ?? 'default'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Max pages/audit</dt><dd>{workspace.max_pages_per_audit as number ?? 'default'}</dd></div>
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Members ({members.length})</h2>
          <div className="space-y-2">
            {members.map((m: Record<string, unknown>) => (
              <div key={m.user_id as string} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-gray-500">{m.user_id as string}</span>
                <span className={`px-2 py-0.5 text-xs rounded ${m.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{m.role as string}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Projects ({projects.length})</h2>
        {projects.map(p => (
          <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
            <div>
              <span className="font-medium">{p.display_name}</span>
              <span className="ml-2 text-gray-400 font-mono text-xs">{p.domain}</span>
            </div>
            <span className={`px-2 py-0.5 text-xs rounded ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {p.is_active ? 'active' : 'inactive'}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Recent audits</h2>
        <div className="space-y-2">
          {(recentAudits as Array<Record<string, unknown>>).map(run => (
            <div key={run.id as string} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
              <div>
                <Link href={`/admin/audits/${run.id as string}`} className="font-mono text-xs text-brand-600 hover:underline">{(run.id as string).slice(0, 8)}</Link>
                <span className="ml-2 text-gray-500">{new Date(run.created_at as Date).toLocaleString()}</span>
              </div>
              <span className={`px-2 py-0.5 text-xs rounded ${
                run.state === 'completed' ? 'bg-green-100 text-green-700' :
                run.state === 'failed' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              }`}>{run.state as string}</span>
            </div>
          ))}
          {recentAudits.length === 0 && <p className="text-sm text-gray-500">No audits yet.</p>}
        </div>
      </div>

      {/* Suspension controls */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Account controls</h2>
        <p className="text-sm text-gray-500 mb-4">
          Suspension blocks new audits and scheduled jobs. Existing running jobs may finish. Read access to existing reports is preserved.
        </p>
        <form action={`/api/admin/workspaces/${params.workspaceId}/suspension`} method="post">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label htmlFor="suspension-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <input id="suspension-reason" name="reason" type="text" required
                placeholder="Describe the reason for this action"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <button type="submit" name="action" value={workspace.is_suspended ? 'reactivate' : 'suspend'}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${workspace.is_suspended ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
              {workspace.is_suspended ? 'Reactivate' : 'Suspend'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
