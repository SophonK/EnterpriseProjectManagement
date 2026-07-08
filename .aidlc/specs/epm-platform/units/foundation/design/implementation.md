# Foundation — Implementation Plan

## Directory Structure (backend monorepo)
```
EnterpriseProjectManagement/
├── apps/api/
│   ├── src/
│   │   ├── foundation/
│   │   │   ├── auth/         # OIDC service, JWT verify, guards (RBAC + scope)
│   │   │   ├── errors/       # AppError, RFC7807 exception filter
│   │   │   ├── events/       # EventBus, DomainEvent, idempotency helper
│   │   │   ├── db/           # PrismaService, schema-scoped repos base
│   │   │   ├── audit/        # AuditService + interceptor
│   │   │   ├── config/       # Zod-validated ConfigService
│   │   │   ├── logging/      # pino logger + request-id middleware
│   │   │   └── health/       # HealthController
│   │   ├── modules/          # (empty now — domain units land here)
│   │   └── main.ts           # composition root
│   ├── test/                 # Vitest + Supertest + Testcontainers setup
│   ├── Dockerfile            # multi-stage
│   └── package.json
├── packages/
│   ├── shared/               # @epm/shared (types, Zod schemas, error codes, events)
│   ├── db/                   # @epm/db (prisma schema, migrations, seed)
│   └── config/               # @epm/config (eslint, prettier, tsconfig-base)
├── .github/workflows/ci.yml
├── docker-compose.yml        # postgres + api
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Build Order (foundation tasks feed the wave plan)
1. Monorepo scaffold: pnpm workspace, Turborepo, tsconfig base, ESLint/Prettier (`@epm/config`)
2. `@epm/shared`: error codes, `ProblemDetails`, `DomainEvent<T>`, `AuthContext`, `RecordScope`, base Zod schemas
3. `@epm/db`: Prisma datasource + `schemas[]`, `shared` schema tables (audit_log, outbox, processed_events), migrate, seed roles
4. NestJS app skeleton + `ConfigService` (Zod env) + pino logger + request-id middleware
5. `PrismaService` + schema-scoped repository base
6. Error handling: `AppError` + RFC 7807 exception filter
7. Event bus: typed in-process `EventBus` + idempotency + optional outbox
8. Auth: `openid-client` login/callback/refresh, `jose` JWT verify, `AuthContext`, RBAC + scope guards
9. `AuditService` + audit interceptor
10. `HealthController` (+ DB readiness)
11. Docker multi-stage + docker-compose; GitHub Actions CI (lint → test incl. PBT → build)

## Conventions (from foundation.md / D3)
- Language TS 5.x / Node 20; pnpm 9 + Turborepo; ESLint + Prettier; Vitest.
- Naming: kebab-case files, PascalCase classes/types, camelCase vars.
- API `/api/v1/`; errors RFC 7807; UUID v4 ids; ISO 8601 UTC timestamps; soft delete `deletedAt`.

## Definition of Done (foundation unit)
- Scaffold builds; `pnpm test` green (incl. PBT in correctness.md); `docker-compose up` runs api + Postgres; `/health` returns ok; CI pipeline green; `@epm/shared` publishable.
