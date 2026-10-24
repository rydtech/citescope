# Operations Guide

## Local development

See README.md for full setup instructions.

## Database migrations

Migrations are in `packages/database/src/migrations/`. Apply with:
```bash
npm run migrate --workspace=packages/database
```

Migrations are idempotent — re-running is safe.

## Evidence retention

Default: 90 days. `evidence_artifacts.expires_at` is set to 90 days from creation.
Project deletion: access revoked immediately; records removed within 7 days; backups expire within 35 days.
(Automated cleanup not yet implemented — Phase 2.)

## Worker shutdown

The worker handles SIGTERM and SIGINT. Running jobs are allowed to complete before exit.
BullMQ uses Redis with `maxmemory-policy noeviction` to preserve job durability.

## Audit budgets

- Max 500 pages per audit (configurable per workspace)
- Max 25 rendered pages (Phase 2 — not yet active)
- Rate limit: 1 request/second, 2 concurrent per host
- Retry-After honored; exponential backoff on errors

## SSRF safety limits

All outbound HTTP requests validate:
- HTTP/HTTPS only, no credentials in URL
- Not localhost, loopback, or RFC 1918 addresses
- Not cloud metadata endpoints (169.254.169.254, metadata.google.internal)
- DNS resolution checked at connection time

## Admin console

- Access via `/admin` — requires platform admin grant
- First admin provisioned via `scripts/provision-admin.ts`
- All privileged actions logged to `admin_activity_log`
- MFA required before exposing to production customer data

## Secrets management

- Secrets in deployment environment variables only
- `.env.example` contains only placeholders
- `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never in client bundles

## Missing integrations (Phase 1)

The following require external credentials or later phases:
- Supabase Storage (evidence stored as excerpts in DB)
- Browser rendering (Playwright — Phase 2)
- AI content assessment (Phase 3)
- Visibility measurement (Phase 4)
