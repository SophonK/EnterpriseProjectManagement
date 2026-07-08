# Technology Context

## Summary
<!-- 3-line max -->
- **Stack**: TypeScript (Node.js 20) API + React web · PostgreSQL · pnpm + Turborepo
- **Architecture**: Modular Monolith (7 domain units as in-process modules) · Hybrid repo (backend monorepo + separate web repo)
- **Infra**: Combined Foundation unit · GitHub Actions · rolling deploys (stack locked at Foundation DF)

## Stack

- **Languages**: TypeScript 5.x (backend + frontend)
- **Frameworks**: Node.js 20 LTS API; React (TypeScript) web
- **Build System**: Turborepo (backend monorepo)
- **Package Manager**: pnpm 9.x (workspaces)
- **Testing**: Vitest; fast-check for property-based tests (math/serialization)

## Architecture

- **Pattern**: Modular Monolith — 7 domain units as internal modules under one deployable API
- **API Style**: REST, URL-versioned `/api/v1/`; in-process typed module APIs between units + async domain events

## Infrastructure

- **Cloud Provider**: TBD at Operations (IaC deferred)
- **Compute**: Single API deployable (container) + separate web app
- **Database**: PostgreSQL — single database, schema per unit
- **IaC Tool**: TBD at Operations

## Patterns & Conventions

- **Architecture pattern**: Modular Monolith; module → service interface → repository → schema; composition root wires modules
- **Data access**: Per-unit repositories over its own PostgreSQL schema; no cross-schema writes
- **API response format**: JSON; errors as RFC 7807 (`application/problem+json`)
- **Error handling**: Shared RFC 7807 handler + `[DOMAIN]_[NUMBER]` error-code registry in `@epm/shared`
- **Authentication**: OAuth2/OIDC (enterprise IdP), short-lived JWT + refresh; RBAC + record-level scoping via shared auth middleware (`AuthContext`)
- **Validation**: Input validation at module boundary (schema-validated DTOs)
- **Logging**: Structured JSON, correlation via `X-Request-Id`
- **Code style**: ESLint + Prettier (shared config in `packages/config`)
- **Naming conventions**: kebab-case files, PascalCase types/classes, camelCase vars, kebab-case routes
- **Branch strategy**: GitHub Flow — `feature/epm-platform/unit-{name}` branches, PR review, merge to main (see team-workflow.md)

## Shared Conventions (Foundation)

- **Auth**: OAuth2/OIDC + JWT; `AuthContext { userId, roles, recordScopes }`; deny-by-default, per-handler permission
- **Errors**: RFC 7807 + shared codes (`VALIDATION_001`, `AUTH_001/002`, `NOT_FOUND`, `CONFLICT_001`, `INTERNAL`) + per-unit `[DOMAIN]_[NNN]`
- **Inter-unit comms**: in-process typed module APIs + async domain events `[unit].[entity].[action]`; `DomainEvent<T>`; idempotent handlers keyed by `eventId`
- **Database**: single PostgreSQL, schema per unit (`identity`, `strategy`, `execution`, `resource`, `risk`, `intake`, `reporting`); centralized versioned migrations in `packages/db`
- **Shared types**: `@epm/shared` package (domain types, DTOs, error codes, event schemas); SemVer; published for the separate web repo
- **Logging/observability**: structured JSON, request-id correlation; resiliency-baseline (blocking) — health checks, graceful degradation, recoverability
- **Testing**: Vitest; property-based-testing (partial, blocking) for allocation/utilization math, risk scoring, weighted scoring, report serialization

## Environment Configuration

- **Config approach**: env vars per environment (dotenv locally, platform secrets in staging/prod)
- **Environments**: development, staging, production
- **Secrets management**: platform secret store (TBD at Operations); `.env` not committed

## CI/CD Pipeline

- **Tool**: GitHub Actions
- **Stages**: lint → test (incl. PBT) → integration (test Postgres) → build → deploy staging → deploy prod (manual)
- **Deploy target**: rolling deployment; migrations before rollout; health-check gated

## Dependency Management

- **Lockfile**: pnpm-lock.yaml committed
- **Version strategy**: SemVer for shared packages; web pins `@epm/shared` version
- **Monorepo tooling**: pnpm workspaces + Turborepo (backend); web is a separate repo (Hybrid)
