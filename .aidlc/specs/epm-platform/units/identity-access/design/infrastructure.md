# identity-access — Infrastructure Design (expanded)

This unit ships **no new infrastructure** — it runs inside the foundation's Modular Monolith and
reuses its deployment, DB, CI/CD, and observability. Only schema + module wiring are added.

## Deployment
- Part of the single `apps/api` deployable (no separate service). Rolling deploy via the foundation
  pipeline; readiness gated by `/health`.

## Database
- Adds the `identity` schema tables via Prisma migration **`0003_identity`** (applied by the same
  `prisma migrate deploy` step already in CI/CD).
- Seed extends the existing seed: 8 roles, `identity:*` permissions, Director grants.

## Component → Service mapping
| Logical component | Runs as | Notes |
|---|---|---|
| IdentityAccessModule (+ providers/controller) | In-process Nest module | wired into AppModule |
| identity tables | Managed PostgreSQL (`identity` schema) | same DB instance |
| RBAC registry load | App boot (onModuleInit) | no external service |
| Login provisioning | In-process event subscriber | via foundation event bus/outbox |

## CI/CD
- No new pipeline. Existing `ci.yml` covers it: `prisma generate` → `migrate deploy` (now includes
  `0003_identity`) → lint → build → test. Integration tests (Testcontainers) exercise the migration
  where Docker is available.

## Configuration
- No new required env vars. (Session TTL / refresh handled by foundation OIDC config.)

## Observability
- Reuses pino structured logs + requestId; admin mutations emit audit rows queryable via
  `GET /api/v1/identity/audit`.

> Foundation touch-points (enricher hook + `auth.login.succeeded` event) are code changes in the
> shared `foundation/auth` module, not infrastructure — coordinated by the Tech Lead and gated by
> solutions-review.
