'use client';
import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CreateProjectRequestSchema } from '@citescope/contracts';

export default function NewProjectPage() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const router = useRouter();
  const [form, setForm] = useState({
    domain: '',
    display_name: '',
    business_description: '',
    authorization_method: 'domain_verification' as 'domain_verification' | 'agency_authorization',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const parsed = CreateProjectRequestSchema.safeParse({
      workspace_id: workspaceId,
      domain: form.domain,
      display_name: form.display_name,
      business_description: form.business_description || undefined,
      authorization_method: form.authorization_method,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Invalid input');
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? 'Failed to create project');
      setLoading(false);
      return;
    }

    const project = await res.json() as { id: string };
    router.push(`/dashboard/workspaces/${workspaceId}/projects/${project.id}`);
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Add project</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-4">
        {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
        <div>
          <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
          <input id="domain" type="text" required placeholder="example.com"
            value={form.domain} onChange={e => {
              const raw = e.target.value;
              const clean = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
              setForm(f => ({ ...f, domain: clean }));
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <p className="text-xs text-gray-400 mt-1">Enter domain only, e.g. example.com — protocol is stripped automatically. Audits start over HTTP.</p>
        </div>
        <div>
          <label htmlFor="display-name" className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
          <input id="display-name" type="text" required
            value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label htmlFor="biz-desc" className="block text-sm font-medium text-gray-700 mb-1">Business description (optional)</label>
          <textarea id="biz-desc" rows={3}
            value={form.business_description} onChange={e => setForm(f => ({ ...f, business_description: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">Authorization method</legend>
            <div className="space-y-2">
              {(['domain_verification', 'agency_authorization'] as const).map(method => (
                <label key={method} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="auth-method" value={method}
                    checked={form.authorization_method === method}
                    onChange={() => setForm(f => ({ ...f, authorization_method: method }))}
                    className="text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm">
                    {method === 'domain_verification' ? 'Domain verification (I own this domain)' : 'Agency authorization (I have explicit permission)'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50">
          {loading ? 'Adding...' : 'Add project'}
        </button>
      </form>
    </div>
  );
}
