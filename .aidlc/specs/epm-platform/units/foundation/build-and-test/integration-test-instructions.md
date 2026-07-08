# Integration Test Instructions — Unit: foundation

## Scope
Verifies the Prisma migration applies to a real PostgreSQL and produces the schema-per-unit
layout + shared tables (`audit_log`, `outbox`, `processed_events`).

## Requirements
- **Docker engine** (Testcontainers launches a throwaway `postgres:16-alpine`), **or**
- a reachable PostgreSQL + `DATABASE_URL` for the non-container path (`prisma migrate deploy`).

## Run (Testcontainers)
```bash
pnpm --filter @epm/db test:int
```
- With Docker present: starts Postgres, runs `prisma migrate deploy`, asserts 8 schemas + 3 shared tables. Expected: **2 tests passed**.
- Without Docker: the suite **skips gracefully** (2 skipped, exit 0) — this is the current dev/CI-primary environment.

## Run (non-Docker, against a live Postgres)
```bash
export DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/epm?schema=shared
pnpm --filter @epm/db exec prisma migrate deploy
# then verify schemas/tables via psql or the app's GET /health
```

## CI
- Primary `ci.yml` applies migrations against a GitHub-managed Postgres service (non-Docker authoring).
- A separate non-blocking `integration` job runs the Testcontainers suite on the runner's Docker.

## Status here
Docker unavailable in this environment → integration executes as **skipped** (ready to run where Docker/Postgres exists). Migration SQL itself is validated by `prisma validate` + `migrate diff`.
