# Tasks — Unit: foundation

## Summary
- **Total Tasks**: 35 across 11 phases
- **Strategy**: Component-first, dependency order · test-first for shared logic · sequential (owner: Sophon)
- **Testing**: Vitest + fast-check (PBT) + Testcontainers · **Estimates**: T-shirt (S/M/L)
- **Execution Waves**: 7 waves (3 with parallelizable phases)

---

- [x] 1. Monorepo Scaffold & Tooling
  - [x] 1.1 Init pnpm workspace + Turborepo (`pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`) — S
  - [x] 1.2 `@epm/config` package: shared ESLint + Prettier + tsconfig base — S
  - [x] 1.3 Root scripts (lint/test/build) + `.gitignore` + `.env.example` — S

- [x] 2. `@epm/shared` Package
  - [x] 2.1 Error code registry + `ProblemDetails` type + `AppError` — S
  - [x] 2.2 `AuthContext`, `Role`, `Permission`, `RecordScope` types + Zod schemas — M
  - [x] 2.3 `DomainEvent<T>` type + event serialize/deserialize helpers — S
  - [x] 2.4 PBT: event serialize↔deserialize round-trip (P1) [+ P2 error-mapping groundwork; P5 config schema deferred to Phase 4] — M

- [x] 3. `@epm/db` (Prisma + Schemas)
  - [x] 3.1 Prisma datasource + generator + `schemas[]` (identity, strategy, execution, resource, risk, intake, reporting, shared) — M
  - [x] 3.2 `shared` schema tables: `audit_log`, `outbox`, `processed_events` — M
  - [x] 3.3 Prisma Migrate baseline + `seed.ts` (role/permission catalog) — M
  - [x] 3.4 Integration test: migrate + seed against Testcontainers Postgres — S [written; execution deferred — no Docker here, skips gracefully]

- [x] 4. NestJS App Skeleton
  - [x] 4.1 Nest app + composition root (`main.ts`) + module registration scaffolding — M
  - [x] 4.2 `ConfigService` (Zod-validated env, secret resolution, fail-fast on invalid) — M [incl. deferred PBT P5]
  - [x] 4.3 pino logger + `X-Request-Id` middleware — S

- [x] 5. Data Access Layer
  - [x] 5.1 `PrismaService` (lifecycle, schema-scoped client) — S
  - [x] 5.2 Repository base + per-schema binding + no-cross-schema-write guard convention — M

- [x] 6. Error Handling
  - [x] 6.1 RFC 7807 exception filter (`AppError` → problem+json, attach requestId) — M
  - [x] 6.2 PBT: error-code → HTTP status mapping totality (P2) — S

- [x] 7. Event Bus
  - [x] 7.1 Typed in-process `EventBus` (publish/subscribe) — M
  - [x] 7.2 Transactional outbox write + post-commit relay — M
  - [x] 7.3 Idempotency ledger (`processed_events`) + helper — M
  - [x] 7.4 PBT + integration: at-most-once effect on duplicate delivery (P4) — M [unit PBT green; DB-backed integration variant deferred (needs Docker)]

- [x] 8. Authentication & Authorization
  - [x] 8.1 OIDC login/callback/refresh/logout via `openid-client` (mock IdP for dev/CI) — L [runtime deferred — needs live IdP]
  - [x] 8.2 JWT verification with `jose` + JWKS cache + circuit-breaker/timeout — M
  - [x] 8.3 `AuthContext` builder from claims — S
  - [x] 8.4 `RbacGuard` + `ScopeGuard` (`canAccess`) + boot-time permission-metadata scan — L [global AuthGuard, deny-by-default]
  - [x] 8.5 PBT: RBAC record-scope evaluation (P3, deny-by-default, Director override) — M
  - [x] 8.6 helmet + rate-limiter on `/auth/*` — S

- [x] 9. Audit
  - [x] 9.1 `AuditService` (append immutable entry) — S
  - [x] 9.2 Audit interceptor (transactional capture on state change + access-denied) — M [access-denied via guard + interceptor; state-change via explicit AuditService.record in unit tx]

- [x] 10. Health & Resilience Wiring
  - [x] 10.1 `HealthController` (liveness + DB readiness) — S
  - [x] 10.2 Wire timeouts/retries + graceful shutdown — S [enableShutdownHooks; IdP JWKS timeout in TokenVerifier]

- [x] 11. CI/CD (non-Docker primary) + Containerization (optional)
  - [x] 11.2 GitHub Actions CI (primary, non-Docker): install → prisma generate → migrate deploy (Postgres service) → lint → build → test; separate non-blocking Testcontainers integration job — M
  - [x] 11.3 CD (release.yml): publish `@epm/shared` (SemVer) + rolling, migration-gated deploy placeholder — M
  - [x] 11.1 Dockerfile (multi-stage) + `docker-compose.yml` — M [OPTION 2 / optional containerized path, not required for dev or CI]

---

## Execution Waves

Single owner (Sophon) → executed sequentially, but grouped by dependency so parallelizable phases are visible. File ownership shown for parallel waves (no overlap).

### Wave 1
- **Phase 1** — Monorepo Scaffold — owns: repo root, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `packages/config/`

### Wave 2 (parallelizable)
- **Phase 2** — `@epm/shared` — owns: `packages/shared/`
- **Phase 3** — `@epm/db` — owns: `packages/db/`

### Wave 3
- **Phase 4** — NestJS App Skeleton — owns: `apps/api/src/main.ts`, `apps/api/src/foundation/config/`, `apps/api/src/foundation/logging/`

### Wave 4 (parallelizable)
- **Phase 5** — Data Access — owns: `apps/api/src/foundation/db/`
- **Phase 6** — Error Handling — owns: `apps/api/src/foundation/errors/`
- **Phase 7** — Event Bus — owns: `apps/api/src/foundation/events/`

### Wave 5
- **Phase 8** — Auth — owns: `apps/api/src/foundation/auth/`

### Wave 6 (parallelizable)
- **Phase 9** — Audit — owns: `apps/api/src/foundation/audit/`
- **Phase 10** — Health & Resilience — owns: `apps/api/src/foundation/health/`

### Wave 7
- **Phase 11** — Containerization & CI/CD — owns: `apps/api/Dockerfile`, `docker-compose.yml`, `.github/workflows/`

**Dependency notes**: W2 needs W1; W3 needs `@epm/shared`+`@epm/db`; W4 needs app skeleton; W5 (auth) needs errors+events+shared; W6 needs events (audit) + db (health); W7 packages the built app.

---

## Coverage
- **Components**: all 13 foundation components have tasks
- **Data model**: shared-schema tables (audit/outbox/ledger) + migrations
- **API**: /health + /auth/* endpoints
- **Integration**: OIDC (mock-first)
- **NFR**: security (auth/audit/validation/headers), resiliency (health/idempotency/breaker/outbox)
- **Correctness**: PBT tasks for P1–P5
