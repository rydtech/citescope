import { requirePlatformAdmin } from '@/lib/admin-auth';
import { getAdminActivityLog } from '@citescope/database';

export default async function AdminActivityPage({ searchParams }: { searchParams: { page?: string } }) {
  await requirePlatformAdmin();

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  let result;
  let loadError = false;
  try {
    result = await getAdminActivityLog({ limit, offset });
  } catch {
    loadError = true;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Activity Log</h1>
      <p className="text-sm text-gray-500 mb-4">
        Immutable record of privileged access and changes. Administrators cannot edit this log.
      </p>

      {loadError ? (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Failed to load activity log.</div>
      ) : !result || result.entries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No admin activity recorded yet.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Actor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Action</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Target</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Outcome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.entries.map((entry: Record<string, unknown>) => (
                <tr key={entry.id as string} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(entry.created_at as Date).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-600">{entry.actor_email as string}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{entry.action as string}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {entry.target_type ? `${entry.target_type as string}: ${(entry.target_id as string ?? '').slice(0, 8)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded ${entry.outcome === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {entry.outcome as string}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{entry.reason as string ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
