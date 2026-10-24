'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateWorkspaceRequestSchema } from '@citescope/contracts';

export default function NewWorkspacePage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function handleNameChange(v: string) {
    setName(v);
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const parsed = CreateWorkspaceRequestSchema.safeParse({ name, slug });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Invalid input');
      setLoading(false);
      return;
    }
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? 'Failed to create workspace');
      setLoading(false);
      return;
    }
    const ws = await res.json() as { id: string };
    router.push(`/dashboard/workspaces/${ws.id}`);
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create workspace</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-4">
        {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
        <div>
          <label htmlFor="ws-name" className="block text-sm font-medium text-gray-700 mb-1">Workspace name</label>
          <input id="ws-name" type="text" required value={name} onChange={e => handleNameChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label htmlFor="ws-slug" className="block text-sm font-medium text-gray-700 mb-1">URL slug</label>
          <input id="ws-slug" type="text" required value={slug} onChange={e => setSlug(e.target.value)}
            pattern="^[a-z0-9-]+$" className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50">
          {loading ? 'Creating...' : 'Create workspace'}
        </button>
      </form>
    </div>
  );
}
