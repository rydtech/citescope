import { requireAuth } from '@/lib/auth';
import { getAuditRunById, getFindingsByAuditRun, getEvidenceByFinding, requireWorkspaceMember } from '@citescope/database';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { EvidenceArtifact } from '@citescope/database';

const STATE_LABELS: Record<string, { label: string; class: string }> = {
  queued:    { label: 'Queued',    class: 'bg-gray-100 text-gray-600' },
  running:   { label: 'Running',   class: 'bg-blue-100 text-blue-700' },
  partial:   { label: 'Partial',   class: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Completed', class: 'bg-green-100 text-green-700' },
  failed:    { label: 'Failed',    class: 'bg-red-100 text-red-700' },
  canceled:  { label: 'Canceled',  class: 'bg-gray-100 text-gray-500' },
};

const SEVERITY_ORDER: Record<string, number> = { high: 1, medium: 2, low: 3, advisory: 4 };
const RESULT_ORDER: Record<string, number> = { fail: 1, review: 2, pass: 3, unknown: 4, not_applicable: 5 };

export default async function AuditPage({ params }: { params: { workspaceId: string; projectId: string; auditId: string } }) {
  const user = await requireAuth();
  const membership = await requireWorkspaceMember(params.workspaceId, user.id).catch(() => null);
  if (!membership) notFound();
  const run = await getAuditRunById(params.auditId, params.workspaceId).catch(() => null);
  if (!run) notFound();

  let findings: Awaited<ReturnType<typeof getFindingsByAuditRun>> = [];
  let findingsError: string | null = null;
  try {
    findings = await getFindingsByAuditRun(params.auditId, params.workspaceId);
  } catch {
    findingsError = 'Failed to load findings. Please try refreshing.';
  }

  // Load evidence for each finding (fail-open: missing evidence does not break the page)
  const evidenceByFinding = new Map<string, EvidenceArtifact[]>();
  if (findings.length > 0) {
    await Promise.all(
      findings
        .filter(f => f.result !== 'pass') // Only load evidence for non-pass findings
        .map(async f => {
          try {
            const ev = await getEvidenceByFinding(f.id, params.workspaceId);
            if (ev.length > 0) evidenceByFinding.set(f.id, ev);
          } catch {
            // Evidence is supplemental — don't fail the page if it's unavailable
          }
        })
    );
  }

  const sorted = [...findings].sort((a, b) => {
    const resultDiff = (RESULT_ORDER[a.result] ?? 9) - (RESULT_ORDER[b.result] ?? 9);
    if (resultDiff !== 0) return resultDiff;
    return (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
  });

  const stateInfo = STATE_LABELS[run.state] ?? STATE_LABELS.queued!;
  const config = run.config_snapshot as {
    technical_score?: number;
    technical_score_insufficient_data?: boolean;
    assessed_rules?: number;
    total_rules?: number;
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-sm text-gray-500 mb-2">
          <Link href={`/dashboard/workspaces/${params.workspaceId}`} className="hover:underline">Workspace</Link>
          {' / '}
          <Link href={`/dashboard/workspaces/${params.workspaceId}/projects/${params.projectId}`} className="hover:underline">Project</Link>
          {' / '}
          Audit {params.auditId.slice(0, 8)}
        </div>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-2 py-0.5 text-sm rounded font-medium ${stateInfo.class}`}>{stateInfo.label}</span>
              <span className="text-sm text-gray-500">{new Date(run.created_at).toLocaleString()}</span>
            </div>
            {run.failure_reason && (
              <p className="text-sm text-red-600">Error: {run.failure_reason}</p>
            )}
          </div>
          {config.technical_score !== undefined && (
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900">
                {config.technical_score_insufficient_data ? '—' : `${config.technical_score}`}
              </div>
              <div className="text-xs text-gray-500">Technical health score</div>
              {config.technical_score_insufficient_data && (
                <div className="text-xs text-yellow-600 mt-1">Insufficient data</div>
              )}
              {config.assessed_rules !== undefined && config.total_rules !== undefined && (
                <div className="text-xs text-gray-400 mt-1">
                  {config.assessed_rules}/{config.total_rules} rules assessed
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress counters */}
      <div className="grid grid-cols-3 gap-4 mb-6 sm:grid-cols-6">
        {[
          { label: 'Discovered', value: run.pages_discovered },
          { label: 'Fetched', value: run.pages_fetched },
          { label: 'Blocked', value: run.pages_blocked },
          { label: 'Failed', value: run.pages_failed },
          { label: 'Excluded', value: run.pages_excluded },
          { label: 'Evaluated', value: run.pages_evaluated },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-lg font-bold">{c.value}</div>
            <div className="text-xs text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Findings */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Findings ({sorted.filter(f => f.result === 'fail').length} issues
          {sorted.filter(f => f.result === 'review').length > 0 ? `, ${sorted.filter(f => f.result === 'review').length} review` : ''})
        </h2>

        {findingsError && (
          <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {findingsError}
          </div>
        )}

        {['running', 'queued'].includes(run.state) && (
          <div role="status" aria-live="polite" className="mb-4 p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">
            Audit is in progress. This page will show results when complete. Refresh to check status.
          </div>
        )}

        {sorted.length === 0 && run.state === 'completed' && (
          <div className="text-center py-12 text-gray-500">No findings generated. Check audit coverage.</div>
        )}

        <div className="space-y-3">
          {sorted.map(finding => (
            <div
              key={finding.id}
              className={`bg-white rounded-xl border p-4 ${
                finding.result === 'fail' ? 'border-red-200' :
                finding.result === 'review' ? 'border-yellow-200' :
                'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {/* Only show severity badge for non-pass findings */}
                    {finding.result !== 'pass' && (
                      <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                        finding.severity === 'high' ? 'bg-red-100 text-red-700' :
                        finding.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        finding.severity === 'low' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{finding.severity}</span>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      finding.result === 'fail' ? 'bg-red-50 text-red-600' :
                      finding.result === 'review' ? 'bg-yellow-50 text-yellow-600' :
                      finding.result === 'pass' ? 'bg-green-50 text-green-600' :
                      'bg-gray-50 text-gray-500'
                    }`}>{finding.result}</span>
                    <span className="text-xs text-gray-400 font-mono">{finding.rule_id}</span>
                    {/* Only show workflow state for actionable findings */}
                    {finding.result !== 'pass' && (
                      <span className="text-xs text-gray-400">{finding.state}</span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900">{finding.title}</h3>
                  {finding.url && <p className="text-xs text-gray-500 mt-1 font-mono truncate">{finding.url}</p>}
                  <p className="text-sm text-gray-600 mt-2">{finding.description}</p>
                  {/* Only show remediation for actionable findings */}
                  {finding.result !== 'pass' && finding.remediation && (
                    <details className="mt-2">
                      <summary className="text-xs text-brand-600 cursor-pointer hover:underline">Remediation &amp; retest</summary>
                      <div className="mt-2 text-sm text-gray-600 space-y-1">
                        <p><strong>Fix:</strong> {finding.remediation}</p>
                        {finding.retest_instructions && (
                          <p><strong>Retest:</strong> {finding.retest_instructions}</p>
                        )}
                      </div>
                    </details>
                  )}

                  {/* Evidence artifacts for non-pass findings */}
                  {finding.result !== 'pass' && evidenceByFinding.has(finding.id) && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:underline">
                        Evidence ({evidenceByFinding.get(finding.id)!.length} artifact{evidenceByFinding.get(finding.id)!.length !== 1 ? 's' : ''})
                      </summary>
                      <div className="mt-2 space-y-2">
                        {evidenceByFinding.get(finding.id)!.map((ev, i) => (
                          <div key={ev.id} className="bg-gray-50 border border-gray-200 rounded p-2 text-xs font-mono">
                            <div className="text-gray-400 mb-1">
                              #{i + 1} · {ev.extraction_mode} · {ev.rule_id ?? ''}
                              {ev.selector && <span className="ml-2 text-gray-400">{ev.selector}</span>}
                            </div>
                            {ev.excerpt && (
                              <div className="text-gray-700 whitespace-pre-wrap break-all">
                                {ev.excerpt.length > 500 ? ev.excerpt.slice(0, 500) + '…' : ev.excerpt}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Limitations notice */}
      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
        <strong>Limitations:</strong> Technical SEO findings are observations from HTTP responses and HTML at the time of the crawl.
        Results may change if the site or its infrastructure changes; re-run the audit to refresh findings.
        GEO/AEO readiness and AI visibility are separate dimensions not shown here.
        A failed crawl does not produce a score of zero — unknown results are distinct from failures.
        Scope: up to {run.max_pages} pages, HTTP extraction only (no browser rendering in this audit).
        Evidence was captured at crawl time and stored per the 90-day retention policy.
      </div>
    </div>
  );
}
