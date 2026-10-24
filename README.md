# CiteScope

Website Search & AI Visibility Auditing — Phase 1

## Prerequisites

- Node.js 20+
- Docker (for local Postgres and Redis)
- A Supabase project (for auth) or local Docker Postgres

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start local services

```bash
docker compose up -d
```

This starts Postgres on port 5432 and Redis on port 6379.

### 3. Configure environment

```bash
cp .env.example apps/web/.env.local
cp .env.example apps/worker/.env
```

Edit `.env.local` and `.env` to set:
- `DATABASE_URL=postgresql://postgres:localpassword@localhost:5432/citescope`
- `REDIS_URL=redis://localhost:6379`
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` from your Supabase project
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values, public)

### 4. Run database migrations

```bash
DATABASE_URL=postgresql://postgres:localpassword@localhost:5432/citescope \
  npm run migrate --workspace=packages/database
```

### 5. Start the web app

```bash
npm run dev --workspace=apps/web
```

Open http://localhost:3000

### 6. Start the worker

In a separate terminal:

```bash
npm run dev --workspace=apps/worker
```

## Running tests

```bash
# All tests
npm test

# Specific package
npm test --workspace=packages/audit-rules
npm test --workspace=packages/scoring
npm test --workspace=packages/crawler
```

## Provision the first platform admin

After running migrations and signing up as a user:

```bash
ADMIN_BOOTSTRAP_SECRET=your-secret DATABASE_URL=... \
  npx tsx scripts/provision-admin.ts your-secret
```

Then access `/admin` in the browser.

## Supabase setup

CiteScope uses Supabase for authentication only. The application database uses a direct PostgreSQL connection. You need:

1. A Supabase project at https://supabase.com
2. Email auth enabled in Authentication > Providers
3. The project URL and anon key for `.env.local`

For production, also set `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never in client code).

## Integrations that require external credentials

| Integration | Status | What's needed |
|---|---|---|
| Supabase Auth | Required for login | Supabase project URL + anon key |
| PostgreSQL | Required | DATABASE_URL |
| Redis | Required for worker | REDIS_URL |
| AI content assessment | Not implemented (Phase 3) | Provider API key |
| Visibility measurement | Not implemented (Phase 4) | Provider API key |

## Architecture

See `docs/architecture.md` for the full architecture overview.
