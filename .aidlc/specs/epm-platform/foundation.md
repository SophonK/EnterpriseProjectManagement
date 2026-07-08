# Foundation Specification

## Summary
<!-- Compact digest for downstream phases. Read ONLY this section. -->
- **Team**: Small team (2) — Tech Lead: Sophon, Dev: Chavakorn
- **Repo**: Hybrid — backend Modular Monolith monorepo + separate web frontend repo
- **Architecture**: Modular Monolith (7 domain units as internal modules)
- **Gateway**: N/A (single deployable)
- **Auth**: OAuth2 / OIDC (enterprise IdP), short-lived JWT + refresh, RBAC claims
- **Error Format**: RFC 7807 (application/problem+json) + shared error-code registry
- **Inter-Unit Comms**: In-process typed module APIs + async domain events
- **Database**: Single PostgreSQL, schema per unit (bounded-context isolation)
- **Shared Types**: Shared TypeScript package `@epm/shared` (published for cross-repo web use)
- **Frontend**: Separate repo (React/TS) — Shared UI: deferred (single frontend for MVP)
- **Infrastructure Units**: Foundation (combined)

---

## Repository Structure

**Strategy**: Hybrid
**Rationale**: The backend stays a single Modular Monolith monorepo so units call each other in-process against one PostgreSQL database (no network hops, no distributed transactions). The React web app lives in its own repo for independent frontend iteration and deploy cadence. `@epm/shared` is authored in the backend monorepo and published as a versioned package so the separate web repo consumes a stable, SemVer-disciplined artifact — the only cross-repo boundary.

### Backend monorepo — `SophonK/EnterpriseProjectManagement`
```
EnterpriseProjectManagement/
├── apps/
│   └── api/                         # Modular Monolith host (single deployable)
│       ├── src/
│       │   ├── modules/             # one folder per domain unit
│       │   │   ├── identity-access/
│       │   │   ├── strategy-portfolio/
│       │   │   ├── project-execution/
│       │   │   ├── resource-management/
│       │   │   ├── risk-raid/
│       │   │   ├── demand-intake/
│       │   │   └── reporting-dashboards/
│       │   ├── foundation/          # in-process event bus, auth middleware, error handler, db, bootstrap
│       │   └── main.ts              # composition root — wires modules
│       └── package.json
├── packages/
│   ├── shared/                      # @epm/shared — domain types, DTOs, error codes, event schemas (published)
│   ├── config/                      # eslint, prettier, tsconfig base
│   └── db/                          # migrations, schema-per-unit setup, seed
├── infrastructure/                  # IaC (deferred to Operations)
├── .github/workflows/               # GitHub Actions
├── docker-compose.yml               # local Postgres + api
├── turbo.json
└── pnpm-workspace.yaml
```

### Web frontend repo — `<separate>` (React + TypeScript)
```
epm-web/
├── src/
│   ├── features/                    # UI per domain (dashboards, projects, resources, raid, intake)
│   ├── shared/                      # UI primitives, API client
│   └── main.tsx
├── package.json                     # depends on @epm/shared (published version)
└── ...
```

**Cross-repo rule**: Backend publishes `@epm/shared` to a private registry (GitHub Packages). Web pins a version; bumping shared types is a deliberate, reviewed release.

---

## Authentication & Authorization

**Approach**: OAuth2 / OIDC against the enterprise IdP. API validates short-lived JWT access tokens; refresh tokens for renewal.
**Authorization**: RBAC (8 roles) + **record-level scoping** (own portfolio/program/project/resource-pool).
**Enforced at**: Unit level via shared auth middleware (single deployable — no gateway).

**Shared Auth Contract**: `AuthContext { userId, roles: Role[], recordScopes: RecordScope[] }` — produced by `foundation/auth` middleware, injected into every module command/query. Deny-by-default; every handler declares required permission.

> Blocking extension: **security-baseline** — authN/authZ on every request, immutable audit, encryption in transit/at rest, input validation, least privilege. Enforced at design/implement/code-review.

---

## Error Handling

**Format**: RFC 7807 (`application/problem+json`)
**Code Convention**: `[DOMAIN]_[NUMBER]` — e.g., `AUTH_001`, `ALLOC_002`, `RAID_001`
**Standard Shape**: `{ type, title, status, detail, code, requestId }` (RFC 7807 members + `code` + `requestId`)

**Shared Codes** (in `@epm/shared`): `VALIDATION_001` (400), `AUTH_001` (401), `AUTH_002` (403), `NOT_FOUND` (404), `CONFLICT_001` (409), `INTERNAL` (500). Each unit extends with its own `[DOMAIN]_[NNN]` codes registered centrally.

---

## Inter-Unit Communication

**Pattern**: In-process typed module APIs + async domain events (in-process bus for MVP; swappable for a broker later).
**Convention**:
- Module API: each unit exposes a typed service interface (e.g., `ProjectExecutionApi`) consumed via the composition root — no direct cross-module DB access.
- Events: `[unit].[entity].[action]` — e.g., `project-execution.status.changed`, `risk-raid.risk.escalated`, `demand-intake.demand.promoted`.

**Event Schema**: `DomainEvent<T> { eventId, eventType, occurredAt, source, data: T }` (defined in `@epm/shared`).
**Idempotency**: event handlers keyed by `eventId`; handlers designed as upserts/conditional writes to tolerate at-least-once delivery.

---

## Database Strategy

**Approach**: Single PostgreSQL database, **schema per unit** (`identity`, `strategy`, `execution`, `resource`, `risk`, `intake`, `reporting`).
- Cross-schema **writes are forbidden**; a unit owns its schema exclusively.
- Cross-schema **reads** allowed only for `reporting` (read models) and via published module APIs elsewhere.
- Migrations centralized in `packages/db`, namespaced per schema; every schema change is a versioned migration (supports rolling deploys / moderate rollback).

---

## Shared Types & Contracts

**Strategy**: Shared package `@epm/shared`.
- Contents: domain value objects, DTOs, error codes, event schemas, `AuthContext`/`RecordScope`.
- **Versioning**: SemVer; breaking change = major bump + migration note. Web repo pins a version.
- Source of truth for cross-unit and cross-repo contracts.

---

## Code & Data Conventions

### Versioning
- **Shared Packages**: SemVer (MAJOR.MINOR.PATCH); breaking → major.
- **API Versioning**: URL-based `/api/v1/`.
- **Breaking Change Policy**: deprecate one minor release before removal; document migration.

### Code
- **Language**: TypeScript 5.x
- **Runtime**: Node.js 20 LTS
- **Package Manager**: pnpm 9.x (workspaces) + Turborepo
- **Naming**: kebab-case files, PascalCase types/classes, camelCase vars, kebab-case routes
- **Testing**: Vitest (unit/integration); **property-based tests** via fast-check for math/serialization (see below)
- **Linting/Formatting**: ESLint + Prettier (shared config in `packages/config`)

### Data
- **IDs**: UUID v4
- **Timestamps**: ISO 8601 UTC
- **Soft deletes**: Yes, `deletedAt` nullable (audit-friendly)

> Blocking extension: **property-based-testing (partial)** — PBT required for pure functions & serialization round-trips: allocation/utilization math (resource-management), risk-score computation (risk-raid), weighted scoring (demand-intake), report serialization (reporting-dashboards).
> Blocking extension: **resiliency-baseline** — directional AWS Well-Architected reliability guidance: graceful degradation of dashboards, recoverable portfolio data, observability of key flows, health checks.

---

## Infrastructure Units

### Foundation (combined)
**Type**: Infrastructure (not domain)
**Source**: foundation
**Purpose**: Project scaffold + shared in-process infrastructure for the Modular Monolith.
**Priority**: Design and implement BEFORE domain units.
**Responsibilities**: monorepo scaffold (pnpm/Turborepo), `@epm/shared` package, OAuth2/OIDC auth middleware + `AuthContext`, RFC 7807 error handler + code registry, in-process event bus, PostgreSQL setup + schema-per-unit migrations (`packages/db`), audit-log sink, logging/observability baseline, GitHub Actions CI, local `docker-compose`.
**Stories**: None (cross-cutting)
**Depended on by**: all 7 domain units

---

## CI/CD & Deployment (baseline)

**Branch Strategy**: GitHub Flow — short-lived `feature/epm-platform/unit-{name}` branches, PR review, merge to `main`.
**Pipeline Tool**: GitHub Actions.

| Stage | Trigger | Actions |
|-------|---------|---------|
| Lint & Format | Push any branch | ESLint + Prettier check |
| Unit Tests | Push any branch | Vitest + coverage (incl. PBT) |
| Integration Tests | PR to main | Vitest against test Postgres |
| Build | PR to main | Turborepo build, Docker image |
| Deploy Staging | Merge to main | Rolling deploy to staging |
| Deploy Production | Manual approval / tag | Rolling deploy + migrations |

**Deployment Strategy**: Rolling; DB migrations run before rollout; health check gates promotion; rollback = redeploy previous version + reverse migration where needed.

---

## Team Assignments

| Unit | Owner | Priority | Sequence |
|------|-------|----------|----------|
| Foundation | Sophon (Tech Lead) | Foundation | 1st — everything depends on it |
| identity-access | Sophon | High | 2nd — auth/RBAC/audit config |
| strategy-portfolio | Sophon | High | 3rd — hierarchy roots |
| project-execution | Chavakorn | High | 3rd — core delivery (parallel with strategy) |
| resource-management | Chavakorn | High | 4th — depends on project-execution |
| risk-raid | Chavakorn | High | 4th — depends on project-execution |
| demand-intake | Sophon | Medium | 4th — depends on strategy + execution |
| reporting-dashboards | Chavakorn | Medium | 5th — reads all others (last) |

**Parallel Work**: After Foundation + identity-access, Sophon (strategy-portfolio) and Chavakorn (project-execution) proceed in parallel. Once project-execution stabilizes, resource-management / risk-raid (Chavakorn) and demand-intake (Sophon) run in parallel. reporting-dashboards is last.

---

## Repository Ownership Rules

- **Shared packages** (`packages/shared`, `packages/config`, `packages/db`) — changes via PR, **Tech Lead (Sophon) approves**.
- **Unit modules** (`apps/api/src/modules/{unit}`) — owned by the assigned developer.
- **Foundation** (`apps/api/src/foundation`) — owned by Tech Lead.
- **Web repo** — owned jointly; consumes `@epm/shared` at a pinned version.

---

## Sync Schedule

Small team — lighter cadence: weekly integration check on `main`; shared-package changes go through PR review; a solutions review once 2+ unit designs exist.

---

## Risks

- **Contract drift** (backend ↔ web via `@epm/shared`) → SemVer + PR review on shared package; web pins versions.
- **Shared-code conflicts** → only Tech Lead merges shared packages; devs branch per unit.
- **Schema-boundary violations** → enforced convention: no cross-schema writes; caught in code review.
- **Integration delays** → dependency-ordered merge (Foundation → identity → strategy/execution → …).
