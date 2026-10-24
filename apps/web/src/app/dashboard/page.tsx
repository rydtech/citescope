import { requireAuth } from '@/lib/auth';
import { getWorkspacesByUserId } from '@citescope/database';
import Link from 'next/link';

export default async function DashboardPage() {
  const user = await requireAuth();
  const workspaces = await getWorkspacesByUserId(user.id).catch(() => []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <Link
          href="/dashboard/workspaces/new"
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          New workspace
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="mb-4">No workspaces yet.</p>
          <Link href="/dashboard/workspaces/new" className="text-brand-600 hover:underline">
            Create your first workspace
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {workspaces.map(ws => (
            <Link
              key={ws.id}
              href={`/dashboard/workspaces/${ws.id}`}
              className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-500 transition-colors"
            >
              <h2 className="font-semibold">{ws.name}</h2>
              <p className="text-sm text-gray-500 mt-1">/{ws.slug}</p>
              {ws.is_suspended && (
                <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">Suspended</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
