# Implementation Status

Last updated: 2026-10-21

## Phase 1 — First usable technical audit

### Working (local, with database + Redis)

| Feature | Status | Notes |
|---|---|---|
| Monorepo structure | Working | npm workspaces, TypeScript |
| Shared contracts (Zod schemas + enums) | Working | packages/contracts |
| Database migrations | Working | Run `npm run migrate --workspace=packages/database` |
| Typed database queries | Working | packages/database |
| SSRF URL policy | Working | packages/crawler/src/url-policy.ts |
| HTTP page fetcher | Working | packages/crawler/src/fetch.ts |
| Robots.txt parser | Working | packages/crawler/src/robots.ts |
| SEO001 — Failed fetch | Working | Unit tested |
| SEO002 — Broken internal links | Working | Unit tested |
| SEO003 — Redirect loops | Working | Unit tested |
| SEO004 — Robots denial | Working | Unit tested |
| SEO005 — Noindex | Working | Unit tested |
| SEO006 — Empty/missing title | Working | Unit tested |
| SEO007 — Duplicate titles | Working | Unit tested |
| SEO008 — Conflicting canonicals | Working | Unit tested |
| SEO009 — Invalid JSON-LD | Working | Unit tested |
| SEO010 — Sitemap/noindex conflict | Working | Unit tested |
| Deterministic scoring | Working | Unit tested, score version tracked |
| BullMQ worker with crawl handler | Working | Requires Redis |
| BullMQ worker with rules handler | Working | Evaluates all 10 rules |
| BullMQ worker with report handler | Working | Computes and stores score |
| Transactional outbox | Working | DB commit + queue delivery atomic |
| Job idempotency | Working | BullMQ jobId prevents duplicates |
| Audit state machine | Working | queued→running→completed/failed |
| Next.js web app (App Router) | Working | Requires Supabase credentials |
| Sign in / sign up UI | Working | Supabase Auth |
| Workspace management | Working | Create, list |
| Project management | Working | Create with authorization capture |
| Start audit API | Working | Returns audit ID immediately |
| Audit progress page | Working | Page counters, state display |
| Findings list | Working | Sorted by severity |
| Evidence in findings | Working | Stored as excerpts in DB |
| Platform admin grants table | Working | In migration |
| Admin overview screen | Working | Stats for configurable period |
| Admin customers list | Working | Search + pagination |
| Admin customer detail | Working | Members, projects, recent audits |
| Admin audit list | Working | Cross-workspace, filtered |
| Admin activity log | Working | Immutable, paginated |
| Workspace suspension | Working | Blocks new audits, logs action |
| Admin provisioning script | Working | scripts/provision-admin.ts |
| Tenant isolation | Working | workspace_id on all queries |
| Docker config | Working | Dockerfile.web, Dockerfile.worker |
| docker-compose (local dev) | Working | Postgres + Redis |

### Requires external credentials

| Integration | What's needed |
|---|---|
| Supabase Auth | SUPABASE_URL + SUPABASE_ANON_KEY from supabase.com project |
| Production database | DATABASE_URL pointing to Postgres |
| Production Redis | REDIS_URL pointing to Redis |

### Not yet implemented (later phases)

| Feature | Phase |
|---|---|
| Sampled browser rendering | Phase 2 |
| Coverage-aware scoring gates | Phase 2 |
| CSV/PDF exports | Phase 2 |
| Audit scheduling | Phase 2 |
| Retention/deletion automation | Phase 2 |
| GEO/AEO heuristic assessment | Phase 3 |
| AI visibility measurement | Phase 4 |
| Self-service billing | Phase 5 |
| Admin usage/costs screen | Phase 2 |
| Admin system health screen | Phase 2 |
| MFA enforcement for admins | Required before production |

### Mocked / synthetic data

None. Fixture HTML sites in `tests/fixtures/` are used for unit tests. No synthetic demo data is injected outside explicitly labeled demo mode.

### Known limitations

- Rule evaluation in the worker reconstructs minimal HTML from stored DB fields (title, canonical, robots_directive). Full HTML is not stored in Phase 1. Rules that need full HTML (SEO009 JSON-LD, SEO002 links) rely on the crawler storing extracted fields. Full HTML storage via Supabase Storage is Phase 2.
- Evidence artifacts store excerpts in the database directly (no Supabase Storage bucket). Phase 2 adds private bucket storage with signed URLs.
- The admin usage/costs and system health screens are listed in the spec but not yet built (Phase 2 deliverables).
- MFA for platform admins must be configured in Supabase before production deployment.
