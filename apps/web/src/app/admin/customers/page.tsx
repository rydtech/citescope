import { requirePlatformAdmin } from '@/lib/admin-auth';
import { getAllWorkspacesPaginated } from '@citescope/database';
import Link from 'next/link';

export default async function AdminCustomersPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  await requirePlatformAdmin();

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const limit = 25;
  const offset = (page - 1) * limit;
  const search = searchParams.q ?? '';

  let result;
  let loadError = false;
  try {
    result = await getAllWorkspacesPaginated({ limit, offset, search: search || undefined });
  } catch {
    loadError = true;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Customers</h1>

      <form method="get" className="flex gap-2 mb-6">
        <input
          type="search" name="q" defaultValue={search}
          placeholder="Search by workspace name or slug"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Search</button>
      </form>

      {loadError ? (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Failed to load customers.</div>
      ) : !result || result.workspaces.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No customers found{search ? ` for "${search}"` : ''}.</div>
      ) : (
        <>
          <div className="text-sm text-gray-500 mb-3">{result.total} total</div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Workspace</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Members</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Projects</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Audits</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.workspaces.map(ws => (
                  <tr key={ws.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${ws.id}`} className="font-medium text-brand-600 hover:underline">
                        {ws.name}
                      </Link>
                      <div className="text-xs text-gray-400 font-mono">{ws.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ws.member_count}</td>
                    <td className="px-4 py-3 text-gray-600">{ws.project_count}</td>
                    <td className="px-4 py-3 text-gray-600">{ws.audit_count}</td>
                    <td className="px-4 py-3">
                      {ws.is_suspended
                        ? <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">Suspended</span>
                        : <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">Active</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(ws.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.total > limit && (
            <div className="flex gap-2 mt-4 justify-center">
              {page > 1 && <Link href={`/admin/customers?q=${search}&page=${page - 1}`} className="px-3 py-1 border border-gray-200 rounded text-sm">Previous</Link>}
              {offset + limit < result.total && <Link href={`/admin/customers?q=${search}&page=${page + 1}`} className="px-3 py-1 border border-gray-200 rounded text-sm">Next</Link>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
