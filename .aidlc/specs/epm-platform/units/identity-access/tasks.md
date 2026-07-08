# Tasks — Unit: identity-access

## Summary
- **Total Tasks**: 24 across 9 phases
- **Strategy**: Component-first, dependency order · test-first for pure logic · sequential (owner: Sophon)
- **Testing**: Vitest + fast-check (PBT) + Testcontainers · **Estimates**: T-shirt
- **Execution Waves**: 7 waves (2 parallelizable)

---

- [x] 1. Schema, Migration & Seed (`identity`)
  - [x] 1.1 Prisma models: user, role, permission, role_permission, user_role, user_scope — M
  - [x] 1.2 Migration `0004_identity` (via prisma migrate diff) — S
  - [x] 1.3 Seed: 8 roles, `identity:*` permissions, Director grants — S

- [x] 2. `@epm/shared` additions
  - [x] 2.1 identity DTOs (User, AssignRole, GrantScope, ListQuery) + Zod schemas — S
  - [x] 2.2 identity error codes (`IDENTITY_*`) + event types (`identity.role.assigned`, `identity.scope.granted`) — S

- [x] 3. IdentityRepository + DTOs
  - [x] 3.1 IdentityRepository (extends BaseRepository, schema "identity") — M
  - [x] 3.2 Mappers row→DTO — S

- [x] 4. UserDirectoryService (authz resolution)
  - [x] 4.1 resolveRoles(userId) / resolveScopes(userId) — M
  - [x] 4.2 PBT: permission resolution union (P-IA-1) + scope loading faithful/drop-invalid (P-IA-2) — M

- [x] 5. AuthContext enricher binding
  - [x] 5.1 AuthContextEnricher impl delegating to UserDirectoryService — S
  - [x] 5.2 Provide `AUTH_CONTEXT_ENRICHER` (foundation hook, already merged) — S

- [x] 6. RBAC bootstrap
  - [x] 6.1 RbacBootstrapService.onModuleInit → load role_permission into RbacRegistry — M

- [x] 7. JIT provisioning
  - [x] 7.1 UserProvisioningService.upsertFromClaims — M
  - [x] 7.2 Subscribe `auth.login.succeeded` → idempotent upsert — M
  - [x] 7.3 Integration test: login event → user row (Testcontainers) — S

- [x] 8. Admin services + controller
  - [x] 8.1 RoleAdminService: assign/revoke role (audited, tx) + PBT idempotency (P-IA-3) — M
  - [x] 8.2 ScopeAdminService: grant/revoke scope (audited, tx, Zod recordScopeSchema) — M
  - [x] 8.3 IdentityAdminController: users, roles, scopes, audit — `@RequirePermission('identity:*')` — L
  - [x] 8.4 Integration tests: Director-gated endpoints + audit rows written — M

- [x] 9. Module wiring
  - [x] 9.1 IdentityAccessModule (providers, controller, enricher, bootstrap) — S
  - [x] 9.2 Register into AppModule + smoke build/test — S

---

## Execution Waves

Single owner (Sophon) → sequential, grouped by dependency; file ownership shown for parallel waves.

### Wave 1
- **Phase 1** — Schema/Migration/Seed — owns: `packages/db/prisma/*`

### Wave 2 (parallelizable)
- **Phase 2** — `@epm/shared` additions — owns: `packages/shared/src/{types,errors,events}/identity-*`
- **Phase 3** — IdentityRepository — owns: `apps/api/src/modules/identity-access/repositories/`

### Wave 3
- **Phase 4** — UserDirectoryService — owns: `.../identity-access/services/user-directory*`

### Wave 4 (parallelizable)
- **Phase 5** — Enricher binding — owns: `.../identity-access/auth-context-enricher.ts`
- **Phase 6** — RBAC bootstrap — owns: `.../identity-access/rbac-bootstrap.service.ts`

### Wave 5
- **Phase 7** — JIT provisioning — owns: `.../identity-access/services/user-provisioning*`

### Wave 6
- **Phase 8** — Admin services + controller — owns: `.../identity-access/{services/*-admin*, identity-admin.controller.ts}`

### Wave 7
- **Phase 9** — Module wiring — owns: `.../identity-access/identity-access.module.ts`, `apps/api/src/app.module.ts`

**Dependency notes**: W2 needs schema; W3 needs repo; enricher/bootstrap need directory+registry; provisioning needs repo+event; admin needs services+guard; wiring last.

## Coverage
- Data model: 6 identity tables + seed · API: identity admin endpoints · Integration: enricher, login-event provisioning
- NFR: DB-driven authz, Director-gated, audited · Correctness: PBT P-IA-1/2/3
