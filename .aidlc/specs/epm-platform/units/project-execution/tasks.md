# Tasks — Unit: project-execution

## Summary
- **Total Tasks**: 32 across 8 phases
- **Owner**: Chavakorn
- **Strategy**: Bottom-up (shared types → DB schema → repositories → services → controllers) · test-first for domain logic and PBT
- **Testing**: Vitest + fast-check (PBT P1–P5) + Testcontainers (integration)
- **Execution Waves**: 5 waves
- **Stories**: US-016, US-017, US-018, US-019

---

- [x] 1. Shared Types (`@epm/shared`)
  - [x] 1.1 Add `ProjectDTO`, `MilestoneDTO`, `StatusUpdateDTO`, `RollupSummaryDTO`, `ProjectFilter` to `packages/shared/src/types/project-execution.ts` — S
  - [x] 1.2 Add `CreateProjectCommand`, `UpdateProjectCommand`, `AddMilestoneCommand`, `UpdateMilestoneCommand`, `UpdateStatusHealthCommand` DTOs + Zod schemas — M
  - [x] 1.3 Add error codes `EXECUTION_001–004` to shared error registry — S
  - [x] 1.4 Add event payload types: `ProjectCreatedPayload`, `StatusChangedPayload`, `MilestoneOverduePayload`, `RollupRecomputedPayload` — S

- [x] 2. Database Schema (`packages/db`)
  - [x] 2.1 Add Prisma models `Project`, `Milestone`, `StatusUpdate`, `RollupSnapshot` to `packages/db/prisma/schema.prisma` (schema: `execution`) — M
  - [x] 2.2 Migration `0003_execution_init` SQL created; apply when Postgres available — S
  - [x] 2.3 `sourceDemandId` column added to `Project` model (nullable UUID) — S
  - [x] 2.4 Integration test assertions added to `migrate.int.test.ts` (skips gracefully without Docker) — S

- [x] 3. Repositories
  - [x] 3.1 `ProjectRepository` — CRUD + soft-delete (`archivedAt`) + scope filter (portfolioId / programId / ownerUserId) — M
  - [x] 3.2 `ProjectRepository.findBySourceDemandId()` — idempotency lookup — S
  - [x] 3.3 `MilestoneRepository` — CRUD + overdue flag materialization on read/write — M
  - [x] 3.4 `StatusUpdateRepository` — append-only insert + history query ordered by `recordedAt DESC` — S
  - [x] 3.5 `RollupSnapshotRepository` — upsert by `(portfolioId, programId)` + read — S
  - [x] 3.6 Repository unit tests (18 tests, all passing) — M

- [ ] 4. Domain Services
  - [ ] 4.1 `ProjectService.createProject()` — validate dates, assert portfolio exists (via `IStrategyPortfolioService`), persist, emit `ProjectCreated` event, write audit entry — M
  - [ ] 4.2 `ProjectService.updateProject()` — partial update, re-validate dates against stored counterpart, emit, audit — M
  - [ ] 4.3 `ProjectService.archiveProject()` — set `archivedAt`, emit, audit — S
  - [ ] 4.4 `ProjectService.listProjects()` — apply record-scope filter from `AuthContext` — S
  - [ ] 4.5 `MilestoneService.addMilestone()` / `updateMilestone()` / `deleteMilestone()` — CRUD + overdue check on update — M
  - [ ] 4.6 `ProjectService.updateStatusHealth()` — enforce state machine, insert `StatusUpdate`, update `project.status/health`, emit `StatusChanged`, write audit — M
  - [ ] 4.7 `RollupService.recomputeRollup()` — `GROUP BY` query on `(portfolioId, health)`, upsert `RollupSnapshot`, emit `RollupRecomputed` — M
  - [ ] 4.8 `ProjectQueryService.getPortfolioRollup()` / `getAtRiskProjects()` — read-side in-process API for other modules — S

- [ ] 5. PBT & Unit Tests
  - [ ] 5.1 PBT P1: date-range rejection — `plannedEnd < plannedStart` always throws `EXECUTION_001` — S
  - [ ] 5.2 PBT P2: date-range acceptance — `plannedEnd >= plannedStart` always succeeds — S
  - [ ] 5.3 PBT P3: roll-up count consistency — `onTrack + atRisk + offTrack === total` for any health distribution — M
  - [ ] 5.4 PBT P4: milestone overdue completeness — `dueDate < today AND completedAt IS NULL` → `overdue = true` — S
  - [ ] 5.5 PBT P5: status transition completeness — all invalid pairs throw `EXECUTION_003`; all valid pairs succeed — M

- [ ] 6. Event Subscriber
  - [ ] 6.1 `ProjectExecutionEventSub` — subscribe to `demand-intake.demand.promoted`; idempotency check via `findBySourceDemandId`; call `ProjectService.createProject()` — M
  - [ ] 6.2 `StatusChanged` → `RollupService.recomputeRollup()` internal subscriber — S
  - [ ] 6.3 Unit tests for subscriber idempotency (replay same event twice → no duplicate) — S

- [ ] 7. Controllers & Module
  - [ ] 7.1 `ProjectController` — POST, GET (list + single), PATCH, DELETE `/api/v1/projects` · `ZodValidationPipe` + `AuthGuard` + `@RequirePermission()` + `RecordScopeGuard` — M
  - [ ] 7.2 `MilestoneController` — POST, GET, PATCH, DELETE `/api/v1/projects/:id/milestones` — M
  - [ ] 7.3 `StatusController` — POST `/api/v1/projects/:id/status` + GET history — S
  - [ ] 7.4 `RollupController` — GET `/api/v1/portfolios/:id/rollup` + program rollup endpoint — S
  - [ ] 7.5 `ProjectExecutionModule` definition — register providers, export `ProjectService` + `ProjectQueryService`, import `StrategyPortfolioModule` + `IdentityAccessModule` — S
  - [ ] 7.6 Register `ProjectExecutionModule` in `AppModule` (`apps/api/src/app.module.ts`) — S

- [ ] 8. Integration Tests
  - [ ] 8.1 Full CRUD cycle: create project → add milestone → update status → retrieve — M
  - [ ] 8.2 Roll-up recomputation after status change (verify `rollup_snapshot` updated) — M
  - [ ] 8.3 Record-scope filter: Project Manager cannot see other PMs' projects — M
  - [ ] 8.4 `DemandPromoted` event idempotency: replay event → no duplicate project created — S
  - [ ] 8.5 Audit trail: `audit_log` row exists after create/update/archive — S
  - [ ] 8.6 `GET /health` passes with `ProjectExecutionModule` registered — S

---

## Execution Waves

### Wave 1
- **Phase 1** — Shared Types — owns: `packages/shared/src/types/project-execution.ts`, error registry

### Wave 2 (parallelizable)
- **Phase 2** — Database Schema — owns: `packages/db/prisma/schema.prisma` (execution models), migration file
- _(Phase 1 must be complete first)_

### Wave 3 (sequential)
- **Phase 3** — Repositories — owns: `apps/api/src/modules/project-execution/repositories/`
- _(Phase 2 must be complete first; all repos can be written in parallel by file)_

### Wave 4 (parallelizable within)
- **Phase 4** — Domain Services — owns: `services/`
- **Phase 5** — PBT & Unit Tests — owns: `__tests__/project.service.spec.ts`, `rollup.service.spec.ts`, `milestone.service.spec.ts`
- _(Services and their tests develop together; PBT properties written alongside each service)_

### Wave 5 (sequential)
- **Phase 6** — Event Subscriber — owns: `events/`
- **Phase 7** — Controllers & Module — owns: `controllers/`, `project-execution.module.ts`, `app.module.ts`
- **Phase 8** — Integration Tests — owns: `__tests__/project.integration.spec.ts`
- _(Controllers depend on services; integration tests run last)_

---

## Definition of Done

- [ ] All 4 user stories (US-016, US-017, US-018, US-019) pass integration tests
- [ ] PBT properties P1–P5 green
- [ ] `@epm/shared` exports new DTOs, Zod schemas, error codes, event payloads
- [ ] Migration `execution_init` committed and applied
- [ ] All endpoints return RFC 7807 on error paths (tested)
- [ ] Record-scope enforcement verified (PM cannot access other PM's projects)
- [ ] Audit entries written on every mutation
- [ ] `GET /health` green with module registered
- [ ] `RollupSnapshot` updated on `StatusChanged`
- [ ] TypeScript strict — no `any`
- [ ] ESLint + Prettier pass
- [ ] CI green (lint → test → integration → build)
