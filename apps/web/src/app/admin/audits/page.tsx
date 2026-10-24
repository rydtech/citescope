import { requirePlatformAdmin } from '@/lib/admin-auth';
import { getAllAuditRunsPaginated } from '@citescope/database';
import Link from 'next/link';

export default async function AdminAuditsPage({ searchParams }: { searchParams: { state?: string; page?: string } }) {
  await requirePlatformAdmin();

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const limit = 25;
  const offset = (page - 1) * limit;
  const state = searchParams.state ?? '';

  let result;
  let loadError = false;
  try {
    result = await getAllAuditRunsPaginated({ limit, offset, state: state || undefined });
  } catch {
    loadError = true;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">All Audits</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'queued', 'running', 'completed', 'failed', 'canceled', 'partial'].map(s => (
          <Link key={s} href={s ? `/admin/audits?state=${s}` : '/admin/audits'}
            className={`px-3 py-1 text-sm rounded border ${state === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {s || 'All'}
          </Link>
        ))}
      </div>

      {loadError ? (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Failed to load audits.</div>
      ) : !result || result.runs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No audits found.</div>
      ) : (
        <>
          <div className="text-sm text-gray-500 mb-3">{result.total} total</div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Audit ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Workspace</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">State</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Pages</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.runs.map(run => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-brand-600">
                      <Link href={`/admin/audits/${run.id}`} className="hover:underline">{run.id.slice(0, 8)}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${run.workspace_id}`} className="text-brand-600 hover:underline font-mono text-xs">{run.workspace_id.slice(0, 8)}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        run.state === 'completed' ? 'bg-green-100 text-green-700' :
                        run.state === 'failed' ? 'bg-red-100 text-red-700' :
                        run.state === 'running' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{run.state}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{run.pages_fetched}/{run.max_pages}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(run.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.total > limit && (
            <div className="flex gap-2 mt-4 justify-center">
              {page > 1 && <Link href={`/admin/audits?state=${state}&page=${page - 1}`} className="px-3 py-1 border border-gray-200 rounded text-sm">Previous</Link>}
              {offset + limit < result.total && <Link href={`/admin/audits?state=${state}&page=${page + 1}`} className="px-3 py-1 border border-gray-200 rounded text-sm">Next</Link>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
