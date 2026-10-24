'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StartAuditButton({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleStart() {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? 'Failed to start audit');
      setLoading(false);
      return;
    }
    const audit = await res.json() as { id: string };
    router.push(`/dashboard/workspaces/${workspaceId}/projects/${projectId}/audits/${audit.id}`);
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <button
        onClick={handleStart}
        disabled={loading}
        className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? 'Starting...' : 'Start audit'}
      </button>
    </div>
  );
}
