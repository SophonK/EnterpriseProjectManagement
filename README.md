# Enterprise Project Management (EPM/EPPM) Platform

Governance-first EPM platform for an EPMO — portfolio alignment, resource capacity,
cross-team RAID, and demand intake. Backend is a **Modular Monolith** (NestJS + Prisma +
PostgreSQL); the web frontend lives in a separate repo and consumes `@epm/shared`.

Built with the AI-DLC workflow. Specs live under `.aidlc/`.

## Repository layout
```
apps/api/            NestJS Modular Monolith (foundation + domain units)
packages/shared/     @epm/shared — types, DTOs, error codes, events, RBAC logic
packages/db/         @epm/db — Prisma schema (schema per unit), migrations, seed
packages/config/     shared ESLint / Prettier / tsconfig
```

## Prerequisites
- **Node.js 20+**
- **pnpm** via Corepack: `corepack enable`
- **PostgreSQL 16** reachable via `DATABASE_URL` (local install, managed service, or the
  optional Docker stack below)

## Getting started (primary — no Docker required)
```bash
corepack enable
pnpm install

cp .env.example .env          # then set DATABASE_URL + OIDC_* for your environment

# Apply the schema to your Postgres (schemas: identity, strategy, execution, resource,
# risk, intake, reporting, shared)
pnpm --filter @epm/db exec prisma generate
pnpm --filter @epm/db exec prisma migrate deploy   # or `migrate:dev` while developing

pnpm dev                      # start the API (apps/api)
```
Health check: `GET http://localhost:3000/health`.

## Testing
```bash
pnpm lint            # ESLint (flat config)
pnpm build           # Turborepo build across packages
pnpm test            # unit + property-based tests (Vitest + fast-check)

# Integration tests use Testcontainers and therefore need a Docker engine:
pnpm --filter @epm/db test:int
```
Property-based tests cover the foundation's correctness properties: event
serialization round-trip, RFC 7807 error mapping, RBAC record-scope evaluation,
idempotent delivery, and config validation.

## CI/CD
GitHub Actions (`.github/workflows/`):
- **ci.yml** (primary) — runs Node + a GitHub-managed Postgres service (no Dockerfile
  needed): install → prisma generate → migrate deploy → lint → build → test. A separate,
  non-blocking `integration` job runs the Testcontainers suite.
- **release.yml** (CD) — publishes `@epm/shared` (SemVer) and performs a rolling,
  migration-gated, health-checked deploy (target finalized in the Operations phase).

## Option 2 — Docker (optional)
A containerized path is provided for convenience but is **not** required:
```bash
docker compose up            # Postgres + API
# or build only the API image:
docker build -f apps/api/Dockerfile -t epm-api .
```

## Conventions
Auth: OAuth2/OIDC + JWT (RBAC + record-level scoping). Errors: RFC 7807. Inter-unit:
in-process module APIs + transactional-outbox domain events. See
`.aidlc/specs/epm-platform/foundation.md` and `.claude/steering/` for the full set.
