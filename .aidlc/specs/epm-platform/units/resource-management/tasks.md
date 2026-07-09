# Tasks — Unit: resource-management

## Summary
- **Total Tasks**: 34 across 8 phases
- **Owner**: Chavakorn
- **Strategy**: Bottom-up (shared types → DB schema → repositories → services → controllers) · test-first for domain logic and PBT
- **Testing**: Vitest + fast-check (PBT P1–P4) + Testcontainers (integration)
- **Execution Waves**: 5 waves
- **Stories**: US-020, US-021, US-022, US-023, US-024

---

- [ ] 1. Shared Types (`@epm/shared`)
  - [ ] 1.1 Add `ResourceDTO`, `AllocationDTO`, `SkillDTO`, `CapacityPeriodDTO`, `ResourceFilter`, `UtilizationRowDTO`, `CapacityDemandRowDTO` to `packages/shared/src/types/resource-management.ts` — S
  - [ ] 1.2 Add `CreateResourceCommand`, `UpdateResourceCommand`, `AllocateResourceCommand`, `UpdateAllocationCommand` DTOs + Zod schemas — M
  - [ ] 1.3 Add error codes `RESOURCE_001–005` to `packages/shared/src/errors/resource-error-codes.ts` — S
  - [ ] 1.4 Add event payload types: `ResourceAllocatedPayload`, `ResourceOverAllocatedPayload` + `RESOURCE_MANAGEMENT_EVENTS` constants to `packages/shared/src/events/resource-management-events.ts` — S

- [ ] 2. Database Schema (`packages/db`)
  - [ ] 2.1 Add Prisma models `ResourcePool`, `Resource`, `Skill`, `CapacityPeriod`, `Allocation` to `packages/db/prisma/schema.prisma` (schema: `resource`) — M
  - [ ] 2.2 Migration `0007_resource_init` — tables, indexes, CHECK constraints (`period_end >= period_start`, `fte_capacity > 0`, `allocation_pct > 0`) — S
  - [ ] 2.3 Add overlap index `(resource_id, period_start, period_end)` on `allocation` in migration — S
  - [ ] 2.4 Integration test assertions in `migrate.int.test.ts` (tables exist in `resource` schema; skips without Docker) — S

- [ ] 3. Repositories
  - [ ] 3.1 `ResourceRepository` — CRUD + pool-scope filter (`buildResourceScopeWhere`) + `findByIdOrThrow` (throws `RESOURCE_005`) + `findByEmail` — M
  - [ ] 3.2 `AllocationRepository` — CRUD + `sumOverlapping(resourceId, periodStart, periodEnd)` aggregation query + `findByResource` + `findByProject` — M
  - [ ] 3.3 `CapacityPeriodRepository` — CRUD + `findByResourceAndMonth(resourceId, firstOfMonth)` + upsert — S
  - [ ] 3.4 Repository unit tests: scope filter (EPMO vs pool-scoped), overlap sum query, `RESOURCE_005` on missing records — M

- [ ] 4. Domain Services
  - [ ] 4.1 `ResourceService.createResource()` — validate poolId exists, email unique check, persist resource + skills, audit, emit — M
  - [ ] 4.2 `ResourceService.updateResource()` — scope check, partial update, replace skills if provided, recompute `overAllocated` flag, audit — M
  - [ ] 4.3 `ResourceService.deleteResource()` — scope check, soft-delete if future allocations exist else hard-delete, audit — S
  - [ ] 4.4 `ResourceService.listResources()` / `getResource()` — scope filter applied, includes skills + capacity periods — S
  - [ ] 4.5 `AllocationService.allocate()` — validate projectId via `ProjectService.getProject()`, period normalisation (first-of-month), overlap sum, over-allocation check, confirm logic, atomic `$transaction` (allocation + resource.overAllocated), audit, publish events — L
  - [ ] 4.6 `AllocationService.updateAllocation()` — scope check, same over-alloc check as create, atomic update, recompute flag, audit — M
  - [ ] 4.7 `AllocationService.deleteAllocation()` — scope check, delete, recompute `overAllocated` flag for resource, audit — S
  - [ ] 4.8 `UtilizationService.getUtilization()` — date range validation (max 12 months), compute per-resource per-month totals, apply band, scope filter — M
  - [ ] 4.9 `CapacityService.getCapacityDemand()` — date range validation, compute capacity vs demand per pool/month, flag shortfall — M

- [ ] 5. PBT & Unit Tests
  - [ ] 5.1 PBT P1: allocation sum is commutative — arbitrary list of overlapping allocations; total matches naive sum (50 runs) — S
  - [ ] 5.2 PBT P2: over-allocation detection completeness — for any set of existing + new allocations, warning.periods ↔ total>100% for that month (50 runs) — M
  - [ ] 5.3 PBT P3: utilization band exhaustive and non-overlapping — every utilization value maps to exactly one band (100 runs) — S
  - [ ] 5.4 PBT P4: period normalisation idempotent — `normalise(normalise(d)) = normalise(d)` (50 runs) — S
  - [ ] 5.5 Unit tests: `AllocationService` — within capacity, over without confirm (RESOURCE_004), over with confirm saves + publishes event, unknown projectId (RESOURCE_002) — M
  - [ ] 5.6 Unit tests: `UtilizationService` — Under/Optimal/Over bands, range >12m rejected — S

- [ ] 6. Event Subscriber
  - [ ] 6.1 `ResourceManagementEventSub` — subscribe `project-execution.project.created` (no-op, idempotent via `makeIdempotent`) — S
  - [ ] 6.2 Subscribe `project-execution.project.archived` — mark allocations for `projectId` as `archivedProject=true` so excluded from active utilization sum — M
  - [ ] 6.3 Unit tests: first delivery no-op, replay skipped, archived project allocations excluded from utilization — S

- [ ] 7. Controllers & Module
  - [ ] 7.1 `ResourceController` — POST, GET (list + single), PATCH, DELETE `/api/v1/resources`; `ZodValidationPipe(_, "RESOURCE_001")` + `AuthGuard` + `@RequirePermission()` — M
  - [ ] 7.2 `AllocationController` — POST, GET, PATCH, DELETE `/api/v1/resources/:resourceId/allocations` — M
  - [ ] 7.3 `UtilizationController` — GET `/api/v1/resources/utilization` — S
  - [ ] 7.4 `CapacityController` — GET `/api/v1/resources/capacity-demand` — S
  - [ ] 7.5 `ResourceManagementModule` — register providers, export `ResourceService` + `AllocationService` + `UtilizationService` + `CapacityService`, RBAC grants (6 roles), import `ProjectExecutionModule` — S
  - [ ] 7.6 Register `ResourceManagementModule` in `AppModule` — S

- [ ] 8. Integration Tests
  - [ ] 8.1 Full CRUD cycle: create pool → create resource → allocate to project → verify allocation + overAllocated flag — M
  - [ ] 8.2 Over-allocation flow: second allocation pushes >100% without confirm → 422; with confirm → saves, flag set — M
  - [ ] 8.3 Record-scope filter: Resource Manager cannot see another pool's resources — M
  - [ ] 8.4 Utilization heatmap returns correct bands for known allocations — S
  - [ ] 8.5 Capacity-demand shortfall flagged correctly — S
  - [ ] 8.6 `project.archived` event → allocations excluded from utilization sum — S

---

## Execution Waves

### Wave 1
- **Phase 1** — Shared Types — `packages/shared/src/types/resource-management.ts`, error codes, events

### Wave 2
- **Phase 2** — Database Schema — `packages/db/prisma/schema.prisma` (resource models), migration `0007_resource_init`
- _(Wave 1 must complete first)_

### Wave 3
- **Phase 3** — Repositories — `apps/api/src/modules/resource-management/repositories/`
- _(Wave 2 must complete first; repo files can be written in parallel)_

### Wave 4
- **Phase 4** — Domain Services — `services/`
- **Phase 5** — PBT & Unit Tests — `__tests__/`
- _(Services and tests develop together)_

### Wave 5
- **Phase 6** — Event Subscriber — `events/`
- **Phase 7** — Controllers & Module — `controllers/`, `resource-management.module.ts`, `app.module.ts`
- **Phase 8** — Integration Tests — `__tests__/resource-management.int.test.ts`

---

## Definition of Done

- [ ] All 5 user stories (US-020, US-021, US-022, US-023, US-024) pass integration tests
- [ ] PBT properties P1–P4 green
- [ ] `@epm/shared` exports new DTOs, Zod schemas, error codes, event payloads
- [ ] Migration `resource_init` committed and applied
- [ ] Over-allocation: warning returned, RESOURCE_004 on unconfirmed, saves with flag when confirmed
- [ ] Atomic `$transaction` on allocation + overAllocated flag update
- [ ] Record-scope enforcement verified (Resource Manager pool-restricted)
- [ ] Audit entries written on every mutation
- [ ] `GET /health` green with module registered
- [ ] TypeScript strict — no `any`
- [ ] ESLint + Prettier pass
- [ ] CI green (lint → test → integration → build)
