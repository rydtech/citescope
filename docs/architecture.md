# CiteScope Architecture

## Overview

CiteScope is a TypeScript monorepo with:
- `apps/web` — Next.js App Router application (UI + authenticated API routes)
- `apps/worker` — Node.js BullMQ worker (crawl, rules, report jobs)
- `packages/contracts` — Shared Zod schemas and TypeScript enums
- `packages/database` — SQL migrations and typed PostgreSQL queries
- `packages/crawler` — HTTP fetcher, robots.txt parser, URL policy (SSRF guards)
- `packages/audit-rules` — 10 deterministic SEO rules (SEO001–SEO010)
- `packages/scoring` — Deterministic scoring (not calculated by LLM)

## Request flow

```
Browser → Next.js API route → audit_runs record + outbox_events record (atomic)
Worker outbox poller → BullMQ crawl queue
Crawl worker → HTTP fetch loop → pages + evidence records
Rules worker → rule evaluation → findings + evidence links
Report worker → deterministic scoring → audit_runs.config_snapshot updated → state: completed
```

## Tenant isolation

- Every row has `workspace_id`
- All queries are scoped by `workspace_id`
- Workspace membership is checked on every API request
- Workers also validate tenant scope — they do not run arbitrary queries

## Platform admin boundary

- `platform_admin_grants` table is server-managed only
- `isPlatformAdmin(userId)` checked on every privileged request (not just session)
- All privileged actions are logged to `admin_activity_log`
- Customer workspace roles cannot inherit platform admin privileges

## Job reliability

- Transactional outbox: `outbox_events` written in the same transaction as `audit_runs` creation
- Worker polls outbox every 5 seconds and publishes to BullMQ
- All job handlers are idempotent (BullMQ jobId prevents duplicates)
- Audit state transitions recorded in `audit_state_transitions`

## SSRF protection

- `url-policy.ts` validates scheme (http/https only), no credentials in URL
- Resolves DNS and checks against private CIDR patterns
- Both fetch worker and any internal HTTP calls use these guards

## What's not yet implemented

- Supabase Storage (evidence artifacts store excerpts in DB for now)
- Sampled browser rendering (PlaywrightCrawler — Phase 2)
- GEO/AEO heuristic assessment (Phase 3)
- AI visibility measurement (Phase 4)
- PDF/CSV exports (Phase 2)
- Audit scheduling (Phase 2)
