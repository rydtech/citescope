# CiteScope implementation instructions

Version 0.2 · 21 October 2026

Revision note: adds the product owner's platform admin console, cross-customer operational visibility, and associated access controls and acceptance gates. These requirements extend the v0.1 PRD; the Word PRD has not been revised.

## Purpose and product identity

Build CiteScope, a SaaS website auditing application that helps teams identify search issues, inspect evidence, prioritize improvements, and verify fixes. The working descriptor is “Website search and AI visibility auditing.” CiteScope is a proposed product name; domain, company-name, and trademark availability have not been verified. Keep the display name configurable so it can change without a data migration.

This file is intended to be placed at the root of the application repository as `CLAUDE.md`. It is an implementation brief for Claude Code and complements `Website_Intelligence_Platform_PRD_v0.1.docx`. If approved requirements conflict, document the conflict and ask the product owner before implementing the affected behavior. Preserve unrelated repository work and existing instructions.

The intended customer is initially a small SEO agency or in-house marketing team managing authorized public websites. Start with English-language content and a bounded audit workflow. Treat limits, thresholds, and provider choices here as proposed defaults to validate during the pilot.

## Product truth and reporting rules

Keep three dimensions separate in the UI, database, exports, and API:

1. Technical SEO findings: reproducible observations from HTTP responses, HTML, links, and rendered pages.
2. GEO/AEO readiness: a versioned heuristic rubric applied to sampled content. It is not a validated predictor of rankings or citations.
3. Observed AI visibility: recorded mentions and explicit citations in a defined sample of provider responses.

Never claim “GEO compliant,” guaranteed rankings, guaranteed AI citations, or whole-site accessibility/security certification. An accessible page is not proof of search-engine indexing. A mention is not a citation. An API response is not evidence of placement in the provider’s consumer application.

Technical failures, unknown results, and intentional exclusions must remain distinct. A failed crawl must not produce a score of zero. Missing provider credentials or an unavailable integration must display “unavailable,” never fabricated results. Synthetic demo data is allowed only in a clearly labeled demo mode and test fixtures.

## Implementation approach

Use a TypeScript monorepo with one web application and independently running worker processes. Share schemas and business logic. Avoid microservices, Kubernetes, a vector database, Elasticsearch, and a separate Python backend unless an established requirement justifies them.

Before implementation, inspect the repository and explain any material mismatch with this brief. For a new repository, establish the following stack. Verify currently supported stable package versions and compatibility using official documentation; pin dependencies and commit a lockfile. Do not blindly select an obsolete version from this document.

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Web application | Next.js App Router, React, TypeScript | Dashboard, project setup, evidence views, authenticated server routes |
| Styling | Tailwind CSS with accessible reusable components | Consistent forms, navigation, tables, and status displays |
| Workers | Node.js, TypeScript | Crawl orchestration, rules, reports, content assessments, visibility experiments |
| Crawler | Crawlee with CheerioCrawler | HTTP fetching, URL discovery, HTML extraction |
| Browser rendering | Crawlee with PlaywrightCrawler | Isolated rendering of a bounded page sample |
| Persistent database | Supabase PostgreSQL | Tenants, projects, observations, findings, job state, usage, measurement history |
| Authentication | Supabase Auth | Identity and sessions; application code enforces workspace roles |
| Object storage | Private Supabase Storage buckets | Evidence artifacts and reports with explicit retention |
| Queue | BullMQ with compatible managed Redis | Job delivery, retries, concurrency, recurring audit scheduling |
| Data access | SQL migrations and a typed PostgreSQL client | Explicit schema changes and reviewed queries |
| Input validation | Zod | Validate request bodies, shared contracts, and model output |
| Testing | Vitest and Playwright | Unit/integration tests and browser workflow tests |
| Deployment | Docker, Render web service and background workers | Separate web and worker deployments; managed data services |

Start with polling for job progress. Add streaming only if the user experience needs it. Use structured logs from the beginning, including project, audit, job, and rule identifiers without secrets or full sensitive content.

## Suggested repository layout

```text
apps/
  web/                 Next.js UI and authenticated API routes
  worker/              Queue consumers and scheduled job handlers
packages/
  contracts/           Shared Zod schemas, enums, and typed interfaces
  database/            SQL migrations and typed database access
  crawler/             URL policy, fetch orchestration, extraction
  audit-rules/         Deterministic checks and versioned rule registry
  scoring/             Deterministic scoring and coverage calculations
  ai-adapters/         Content assessment and visibility provider interfaces
  reporting/           Report models and export generation
tests/
  fixtures/            Controlled HTML sites and saved provider responses
docs/
  architecture.md
  decisions.md
  operations.md
  implementation-status.md
```

Keep the layout proportional to the code. Do not create empty abstraction layers merely to fill the tree.

## Core user flow

1. Sign in and create a workspace.
2. Add a domain and establish authorization through domain verification or an explicit agency authorization process. Store the method, actor, and time.
3. Confirm business description, audience, market, priority URLs, and intentional exclusions. Website-derived suggestions require user confirmation.
4. Review crawl scope and estimated usage, then start an audit.
5. Immediately display an audit ID and queued status. The request must not wait for the crawl.
6. Show progress and separate discovered, fetched, blocked, failed, excluded, and evaluated counts.
7. Review findings, evidence, category summaries, and limitations.
8. Assign work and retest after the customer changes the website.
9. Later enable a separate, explicitly configured AI visibility experiment.

A user entering `rydtech.io` follows this flow. Do not hard-code facts, findings, scores, ownership, or provider responses for that domain. Automated tests use controlled fixtures, not an unrelated public website.

## Architecture and job lifecycle

```text
Browser → authenticated application API → PostgreSQL audit record
                                      → durable enqueue intent
                                      → BullMQ job
Worker → permitted crawl → evidence → deterministic checks → findings
                                                   → scores → report

Separate jobs: rendered sample, content assessment, visibility experiment
```

PostgreSQL is the durable source of truth. Redis is not the sole record of an audit. Use a transactional outbox or an equivalent reconciliation mechanism so database commits and queue delivery cannot silently diverge. All job handlers must be idempotent because delivery and retries may repeat.

Audit states: queued, running, partial, completed, failed, canceled. Store state transitions and reason codes. Support cancellation and stop scheduling new fetches within 30 seconds. Prevent overlapping scheduled audits for the same project. Reserve usage before work and reconcile actual consumption afterward; retries must not duplicate customer charges.

Use separate queues or independently configured consumers for HTTP crawling, browser rendering, model assessment, visibility calls, and report generation. An optional provider failure must not prevent the technical report from being useful.

## Data model

Create SQL migrations for these logical entities; combine tables only when the relationships remain clear:

| Entity | Essential purpose |
| --- | --- |
| Workspaces and memberships | Tenant boundary and owner/editor/viewer roles |
| Projects and authorization records | Domain, approved scope, business context, verification evidence |
| Audit runs | Configuration snapshot, lifecycle, counters, rule versions, coverage |
| Pages and fetch observations | Requested/final URL, status, timestamps, directives, content hashes, raw/rendered mode |
| Evidence artifacts | Private object reference or excerpt, selector, hash, expiry, redaction status |
| Rule registry | Stable rule ID, version, category, applicability, severity, dependencies, sources |
| Findings and occurrences | Stable issue identity plus immutable evidence for each run |
| Remediation activity | Assignee, workflow state, actor, reason, timestamps, suppression expiry |
| Prompt cohorts and prompts | Versioned wording, intent, language, requested geography, brand aliases |
| Visibility runs and responses | Provider/surface/settings, request IDs, status, answer evidence, usage |
| Mentions and citations | Extraction result, ambiguity state, normalized domain, original citation URL |
| Usage events and outbox | Budget reservations, reconciled consumption, reliable work dispatch |
| Platform admin grants | Privileged user identity, active/revoked status, grant actor and timestamps; separate from workspace membership |
| Platform admin activity | Actor, action, target workspace/resource, time, reason, request ID, outcome, and redacted before/after values for changes |

Every tenant-owned record carries a workspace identifier. Validate related records belong to the same workspace. Scope all server queries and enforce database row-level policies where appropriate. Privileged worker credentials can bypass policies, so workers must also validate tenant scope and jobs must not supply arbitrary privileged queries.

## Crawling requirements

Default scope: one authorized host, up to 500 unique HTML URLs per audit and 25 rendered/content-assessed pages. A redirect to another host must pass explicit scope and authorization handling. Apply distinct limits to total requests, bytes, redirects, runtime, retries, and discovered URLs so non-HTML content cannot bypass budgets.

- Allow public HTTP(S) only. Reject unsupported schemes, userinfo credentials, private/reserved addresses, loopback, and cloud metadata endpoints.
- Validate DNS resolution and each redirect; guard against DNS rebinding at connection time. Enforce network egress restrictions for both HTTP and browser workers.
- Honor robots policy for the declared crawler user agent and user exclusions. Do not bypass access controls, CAPTCHAs, or bot protections.
- Begin with two concurrent requests per host and at most one request per second. Honor Retry-After and back off on rate limits and overload.
- Normalize URLs carefully: remove fragments, preserve meaningful query parameters, bound parameter variants, and detect loops/calendar traps.
- Start with HTTP extraction. Render a disclosed sample chosen from templates and priority pages. Retain the sample selection method.
- Run browsers in isolated environments without application secrets or credentials. A Docker container alone is not a complete security boundary.
- Treat crawled content as untrusted data. It cannot instruct the application or an assessment model to execute tools or alter configuration.

## Initial deterministic rules

Implement ten small checks with individual IDs and versioned applicability. Map them to the broader PRD rule families when reporting. These are proposed checks, not universal ranking requirements.

| ID | Check | Important qualification |
| --- | --- | --- |
| SEO001 | Failed fetch of an expected public page | Distinguish transient errors, authorization blocks, and confirmed HTTP failures |
| SEO002 | Broken internal link target | Store source page, link location, and target evidence |
| SEO003 | Redirect loop or exceeded redirect budget | Store the observed chain |
| SEO004 | Crawler denied by robots policy | Report intentional exclusion separately |
| SEO005 | Noindex on a page intended for search | Blocked/unfetched content is unknown |
| SEO006 | Empty or missing title | Preserve extracted HTML evidence |
| SEO007 | Duplicate title across evaluated pages | Contextual review; do not imply all duplicates are errors |
| SEO008 | Conflicting canonical declarations | Missing canonical alone is advisory |
| SEO009 | Invalid JSON-LD syntax | Successful parsing does not establish semantic validity or rich-result eligibility |
| SEO010 | Sitemap-listed URL contradicts declared search intent | Evaluate only permitted fetched evidence; disclose sample scope |

Every rule returns pass, fail, review, not_applicable, or unknown with a reason code. Evidence includes the URL, observed value, timestamp, extraction mode, and rule version. Findings also provide impact explanation, proposed remediation, and retest instructions. Do not ask a language model whether an objective directive exists when a parser can determine it.

## Scoring contract

Implement scoring as deterministic code. Store inputs and the score version. Do not calculate the authoritative score in a language model.

For each eligible technical rule, pass fraction equals passed units divided by passed plus failed units. A rule declares whether its units are pages, links, or site settings. Category score equals 100 times the weighted mean of evaluated rule pass fractions. Proposed weights are 3 for high, 2 for medium, and 1 for low. Advisory-only findings do not contribute.

Coverage includes unknown and review units in the applicable denominator. Display rule-level coverage and crawl/sample scope. For category gates, calculate coverage within comparable unit types and require every contributing rule to meet the gate; do not let thousands of link checks conceal missing page or site checks. Return “insufficient data” if any contributing rule has less than 80% coverage, a required dependency is unavailable, or there is no evaluable denominator. This is a conservative implementation clarification of the PRD and must be documented in the score version.

Accepted risk or suppression changes workflow presentation, not observed results or scores. Compare historical scores only under compatible methods and cohorts; disclose changes in scope or versions.

GEO/AEO assessment is a later phase. Start with three rubric dimensions: answer clarity, attribution appropriate to the claims, and entity consistency. Use a 0–2 rubric with evidence, unknown states, sample disclosure, and reviewer calibration. Label it “heuristic readiness, not validated as a predictor of rankings or AI citations.” Keep it separate from technical health and visibility rates.

## AI integrations

Use two distinct adapter interfaces: content assessment and visibility measurement. Choose the first provider after checking permitted access, retention, response metadata, citations, quotas, and cost. Avoid committing to a provider solely because a generic text-completion endpoint is available.

Content assessment receives extracted page text, confirmed page purpose, and a versioned rubric. Require schema-validated structured output with quoted evidence and rationale. Verify quoted excerpts exist in the supplied text. Invalid or unsupported output becomes a review/unknown result. Store model and rubric versions. Do not expose tools or secrets to page content.

Visibility measurement receives approved prompts and explicit settings. Default to up to 20 prompts with 3 separate requests per prompt per weekly window. Save exact wording, cohort version, provider, API/product surface, model version when exposed, retrieval settings, language, requested/effective geography, time, status, and original response reference. Disclose unsupported requested settings.

Report branded and unbranded prompts separately. A mention requires an unambiguous approved alias; a citation requires an explicit source link to the approved domain or configured subdomain. Preserve the original URL and do not count a mention as a citation. Track ambiguous extraction separately; do not silently treat ambiguity as absence. Define and show evaluated denominators for each metric.

Only show a visibility rate when at least 80% of planned responses succeed and extraction coverage for that metric also meets 80%. Otherwise show raw observations and an incomplete-data label. Failed requests are never non-mentions. Compare matched cohorts and surfaces; never claim a website edit caused a change merely because it preceded it.

## UI and reporting

Required screens: sign-in, workspace/project setup, crawl configuration, audit progress, findings list, evidence detail, remediation history, and audit comparison. Add visibility setup and results only when the integration is implemented.

Use accessible navigation, keyboard controls, labeled forms, readable tables, explicit loading/empty/error states, and severity labels that do not depend on color. Present technical health, heuristic readiness, and observed visibility as separate panels; do not create a master “SEO/GEO compliance” score.

Finding workflow states: open, in_progress, resolved, accepted_risk, suppressed. Resolution requires a passing retest. Suppression requires a reason, actor, and expiry. Unknown retest outcomes do not resolve issues.

Reports include audit date, scope, coverage, source evidence references, rule/scoring versions, and limitations. Implement CSV export first with spreadsheet formula-injection protection, then a PDF summary. Evidence links must remain private and expire appropriately.

## Platform admin console

The product owner needs a private `/admin` area to oversee all customers who have used CiteScope. This is a platform-level capability distinct from a customer workspace owner's permissions. A customer account may belong to several workspaces, so distinguish user counts, workspace counts, and project counts throughout the console.

### MVP screens and actions

| Screen | Required information and controls |
| --- | --- |
| Overview | Total registered users and workspaces, new signups, active workspaces, completed/partial/failed audits, usage, and estimated operating costs for a selected period |
| Customers | Paginated search by user email, workspace name/ID, and project domain; filter by signup period, activity, and account status |
| Customer detail | Workspace members and roles, associated projects/domains, signup date, last product activity, current entitlements, quota consumption, and recent audits |
| Audits | Cross-workspace run list with customer/project, state, timestamps, scope, page counts, failure reason, and retry history; drill into an individual run |
| Usage and costs | Per-workspace crawled/rendered pages, assessment/provider calls, available token usage, and estimated costs, with period filters and totals |
| Limits and account controls | Review and change workspace quotas/entitlements; suspend or reactivate new paid/resource-consuming work, with a reason and confirmation |
| Support evidence | Explicit, reason-required access to a customer's findings or retained evidence from the run detail page; record access and avoid showing sensitive content in global lists |
| System health | Queue depth and oldest queued-job age, worker heartbeat/failure state, provider errors, and scheduled-job failures; show last refresh time and unavailable telemetry clearly |
| Admin activity | Paginated, filterable history of privileged access and changes, including actor, customer, action, time, outcome, and reason |

Overview definitions: an active workspace has at least one authenticated product interaction or user-initiated audit in the selected period; scheduled runs alone do not establish customer engagement. Show the definition, period, timezone, and last refresh time. Use server-side events, not inferred browser state, for activity metrics. Keep counts consistent between summary cards and drill-down lists.

Initial periods are last 7 days, last 30 days, and a custom date range. Use pagination and server-side filtering for customer, audit, and activity tables. Include loading, empty, permission-denied, stale-data, and failed-query states. Do not expose credentials, access tokens, raw sensitive headers, or payment details.

Estimate provider costs from recorded usage and versioned rate assumptions. Label estimates and their currency explicitly; missing pricing is “unknown,” not zero. Show shared hosting costs separately unless an allocation method is documented. Do not present estimated operating cost as customer billing or recognized revenue.

Suspension blocks new audits, schedules, and provider jobs at both enqueue and worker-start time. Existing running jobs may finish within their reserved budget; do not enqueue follow-on work while suspended. Preserve read access to existing reports unless a separate security restriction applies. Reactivation must not silently replay missed schedules. A quota reduction below consumed/reserved usage blocks new work without rewriting prior usage. Apply quota checks transactionally to avoid concurrent overspending.

The MVP audit screen is observational: automatic retries remain part of the job system. If manual retry/cancel controls are added later, they must use the existing bounded, idempotent job paths, require an explicit action and reason, and create admin activity records.

### Privileged access boundary

- Require authenticated platform-admin status for every admin page, API request, export, evidence-link issuance, and administrative mutation. Hiding navigation is not an authorization control.
- Store platform-admin grants in a restricted server-managed structure. Customer owners/editors/viewers cannot create or update these grants, and editable profile metadata must never establish admin privileges.
- Bootstrap the first product-owner administrator using a documented operator procedure with a verified identity. Do not hard-code an email-based bypass or create a public admin signup flow.
- Require MFA for platform admins before production use. Revalidate grants on privileged requests so revocation takes effect without waiting for a long-lived session to expire.
- Keep customer APIs tenant-scoped, including when called by an administrator. Cross-customer reads occur only through explicitly authorized admin operations. Never place a service-role key in client code.
- Log admin page/data access, evidence access, exports if implemented, and changes. For searches/list views, log the operation and scope without copying sensitive search text or customer evidence into the activity log.
- Make privileged changes and their activity record atomic. If evidence access cannot be durably logged, deny that access. Customer users cannot read or alter the admin activity log; administrators cannot edit it through the console.
- Acknowledge that immutable audit observations and admin activity still follow approved retention/deletion policies. Deleted customer content must not remain accessible through the console or stale signed links. Keep only permitted, minimal operational records after deletion.

Do not implement customer impersonation, bulk customer deletion, billing refunds, payment-method access, or unrestricted database-query consoles in the MVP. Self-service billing administration and additional delegated support roles are later decisions.

### Admin acceptance tests

Use fixtures with at least two customer workspaces and one separately provisioned platform administrator. Verify that:

1. The administrator can find both customers, inspect each customer's projects/audits, and reconcile overview counts with filtered results.
2. Customer owners, editors, viewers, and unauthenticated users cannot access admin routes, APIs, exports, evidence links, or grant-management operations, including by modifying request IDs or profile metadata.
3. Privileged support evidence access requires a reason and produces a durable activity record without logging the evidence content itself.
4. Quota and suspension changes record actor, reason, target, and before/after values; concurrent starts cannot evade limits; suspended scheduled and queued work cannot start new resource-consuming jobs.
5. Revoking a platform-admin grant denies subsequent privileged requests even with an existing session.
6. Unknown costs and missing telemetry display explicit unavailable states; estimates never appear as actual charges.
7. Deletion removes evidence access from admin views under the same lifecycle as customer views. Pagination and filters do not leak customer data into ordinary workspace endpoints.

## Delivery phases and acceptance gates

### Phase 1 — First usable technical audit

Build authentication, one workspace/project flow, authorization capture, bounded HTTP crawl, the ten seed checks, evidence storage, progress UI, and findings detail. Include basic roles, tenant isolation, SSRF controls, job idempotency, and usage caps from the start.

Also implement the platform-admin grant boundary, first-admin provisioning procedure, customer search/detail, cross-customer audit inspection, basic usage visibility, quota/suspension controls, and durable admin activity records. Enforce production MFA before exposing this console to real customer data.

Acceptance: a controlled fixture site produces the expected findings and evidence; an authorized real site can be audited within configured limits; closing the browser does not stop work; blocked access returns an incomplete report without a fabricated score; another workspace cannot read the data.

Admin gate: pass the access-denial, privileged evidence access, grant revocation, and quota/suspension tests above using two customer workspaces. Customer roles must never inherit platform-admin privileges.

### Phase 2 — Operational audit workflow

Complete admin overview metrics, period filters, cost estimates, system-health telemetry, and the filterable activity UI. Run the full platform-admin acceptance suite and verify summary/detail reconciliation.

Add sampled rendering, coverage-aware scoring, assignment/status, targeted retests, comparisons, CSV/PDF exports, weekly scheduling, cancellation, retention, and operational dashboards.

Acceptance: a deliberately fixed fixture resolves only after a passing retest; unknown results do not resolve it; repeated delivery does not duplicate findings or charges; scheduled jobs do not overlap; deletion and restore procedures have been tested.

### Phase 3 — Heuristic readiness

Add confirmed page intent, the versioned rubric, evidence-validated model assessment, confidence/review presentation, and independent reviewer calibration.

Acceptance: rubric outputs have supporting excerpts; missing input produces unknown; score coverage is enforced; prompt-injection fixtures cannot change instructions or access tools; reviewers approve the initial rubric before customer release.

### Phase 4 — Observed visibility beta

Integrate one approved provider, prompt cohorts, metered repeated requests, mention/citation extraction, and comparable run history.

Acceptance: saved response fixtures cover ambiguous brands, explicit citations, missing citations, refusals, timeouts, and provider drift. Errors and ambiguity never silently become absence. Show the actual surface and measurement denominator in UI and exports.

### Phase 5 — Pilot and commercial readiness

Pilot with five authorized customer workspaces. Measure activation, useful report completion, verified fixes, deterministic rule precision, heuristic reviewer agreement, and costs per audit/visibility run. Validate willingness to pay before adding self-service billing. Choose pricing and entitlements from measured costs rather than invented infrastructure estimates.

Do not implement all phases in one unreviewable change. Complete and demonstrate each phase before expanding scope. Update implementation status with what is functional, what is mocked, and which dependencies are unavailable.

## Verification and operations

Run type checking, linting, unit tests, integration tests, and targeted browser workflow tests appropriate to each change. Include tests for rule evidence, zero denominators, low coverage, intentional exclusions, URL traps, redirects, DNS rebinding defenses, tenant isolation, retries, cancellation, and usage accounting.

Use controlled fixture sites for repeatability. CI must not require live paid provider calls. Test database policies using ordinary authenticated roles as well as service paths. A passing frontend test is not evidence that the underlying tenant boundaries are secure.

Default evidence retention is proposed at 90 days. Project deletion revokes access immediately, removes active records/artifacts within 7 days, and expires backups within 35 days, subject to verified provider capabilities. Document retention exceptions before release. Keep secrets in deployment environment variables; include only placeholders in `.env.example`.

Deploy web and workers independently. Configure durable queue persistence and an appropriate no-eviction policy for queue data. Document graceful worker shutdown, bounded retries, failed-job handling, migrations, outbox reconciliation, budget alerts, and a tested restore procedure.

## Required implementation deliverables

- Working source code and reproducible dependency lockfile.
- SQL migrations, development fixtures, and `.env.example` without credentials.
- README covering local setup, running web/workers, and tests.
- Docker configuration and deployment instructions for web and workers.
- Architecture and decision records, including provider/surface choices.
- Operations guide covering safety limits, retention, backups, retries, and costs.
- Implementation status mapped to the phases and acceptance gates above.
- Tests and a demonstrated end-to-end technical audit before AI features.

When credentials or an external decision are missing, continue independent local implementation and fixture testing. Clearly identify the specific integration that remains unavailable. Do not fabricate successful deployment or measurement results.

## Official references

Use these as starting points and verify current documentation during implementation:

- Next.js: https://nextjs.org/docs/app
- Crawlee: https://crawlee.dev/js/docs/introduction/first-crawler
- Playwright: https://playwright.dev/docs/intro
- Supabase database: https://supabase.com/docs/guides/database/overview
- Supabase authentication: https://supabase.com/docs/guides/auth
- Supabase storage: https://supabase.com/docs/guides/storage
- PostgreSQL row security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- BullMQ: https://docs.bullmq.io/
- Render workers: https://render.com/docs/background-workers
- Google AI search guidance: https://developers.google.com/search/docs/appearance/ai-features
- Google robots directives: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
- Google structured data guidance: https://developers.google.com/search/docs/appearance/structured-data/sd-policies

## Suggested first instruction to Claude Code

Read CLAUDE.md and inspect this repository. Implement Phase 1 of CiteScope using the prescribed stack, preserving existing work. First describe the repository state and a concise implementation plan, then build and test the first usable technical audit. Use controlled fixtures, implement tenant isolation and crawler safety from the start, and report what works end to end. Do not implement later-phase AI features, invent credentials, deploy publicly, or purchase services as part of this initial task.
