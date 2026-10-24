import { requirePlatformAdmin } from '@/lib/admin-auth';
import { getAdminOverviewStats } from '@citescope/database';

function StatCard({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
      {note && <div className="text-xs text-gray-400 mt-1">{note}</div>}
    </div>
  );
}

export default async function AdminOverviewPage({ searchParams }: { searchParams: { period?: string } }) {
  await requirePlatformAdmin();

  const period = searchParams.period ?? '30';
  const days = parseInt(period, 10) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let stats;
  let statsError = false;
  try {
    stats = await getAdminOverviewStats(since);
  } catch {
    statsError = true;
  }

  const periodLabel = days === 7 ? 'Last 7 days' : days === 30 ? 'Last 30 days' : `Last ${days} days`;
  const refreshedAt = new Date().toLocaleString();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Platform Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Period: {periodLabel} · Definition: active workspace had a user-initiated audit or product interaction (not scheduled runs alone) ·
            Timezone: UTC · Last refreshed: {refreshedAt}
          </p>
        </div>
        <div className="flex gap-2">
          {['7', '30'].map(d => (
            <a key={d} href={`/admin?period=${d}`}
              className={`px-3 py-1 text-sm rounded ${period === d ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {d}d
            </a>
          ))}
        </div>
      </div>

      {statsError ? (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          Failed to load overview statistics. Database may be unavailable.
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Total registered users" value={stats.total_users} />
          <StatCard label="Total workspaces" value={stats.total_workspaces} />
          <StatCard label="Active workspaces" value={stats.active_workspaces} note={periodLabel} />
          <StatCard label="Completed audits" value={stats.completed_audits} note={periodLabel} />
          <StatCard label="Failed audits" value={stats.failed_audits} note={periodLabel} />
          <StatCard label="Partial audits" value={stats.partial_audits} note={periodLabel} />
          <StatCard label="Queued audits" value={stats.queued_audits} />
        </div>
      ) : (
        <div className="text-gray-400">No data</div>
      )}
    </div>
  );
}
