# Tasks — Unit: strategy-portfolio

## Summary
- **Total Tasks**: 37 across 8 phases
- **Owner**: Sophon
- **Strategy**: Bottom-up (shared types → DB schema → repositories → services → controllers) · test-first for domain logic and PBT
- **Testing**: Vitest + fast-check (PBT P1–P3) + Testcontainers (integration)
- **Execution Waves**: 5 waves
- **Stories**: US-006, US-007, US-008, US-009, US-010, US-011

---

- [x] 1. Shared Types (`@epm/shared`)
  - [x] 1.1 Add `StrategicGoalDTO`, `PortfolioDTO`, `ProgramDTO`, `GoalLinkDTO`, `InvestmentSummaryDTO`, `UnalignedReportDTO` to `packages/shared/src/types/strategy-portfolio.ts` — M
  - [x] 1.2 Add `DefineStrategicGoalCommand`, `CreatePortfolioCommand`, `AssociateGoalsCommand`, `CreateProgramCommand`, `LinkProjectToGoalsCommand` DTOs + Zod schemas — M
  - [x] 1.3 Add error codes `STRATEGY_001–006` to `packages/shared/src/errors/strategy-error-codes.ts` + register — S
  - [x] 1.4 Add event payload types: `PortfolioCreatedPayload`, `ProgramCreatedPayload`, `ProjectLinkedToGoalPayload`, `ProjectFlaggedUnalignedPayload` — S

- [x] 2. Database Schema (`packages/db`)
  - [x] 2.1 Add Prisma models `StrategicGoal`, `Portfolio`, `Program`, `PortfolioGoal`, `GoalLink`, `ProjectAlignmentView` + enums `GoalStatus`/`PortfolioStatus`/`ProgramStatus` to `schema.prisma` (schema: `strategy`) — M
  - [x] 2.2 Migration `0005_strategy_init` SQL created; apply when Postgres available — S
  - [x] 2.3 Migration integration-test assertions (schema + unique/index) added; skips gracefully without Docker — S

- [x] 3. Repositories
  - [x] 3.1 `StrategicGoalRepository` — create / list / archive (status) — S
  - [x] 3.2 `PortfolioRepository` — CRUD + record-scope filter (`ownerId`, Director bypass) + `associateGoals` idempotent PortfolioGoal upsert — M
  - [x] 3.3 `ProgramRepository` — create under portfolio / list by portfolio / `existsById` — S
  - [x] 3.4 `GoalLinkRepository` — idempotent link upsert (`@@unique([goalId, projectId])`), unlink, `countByProject` — M
  - [x] 3.5 `ProjectAlignmentViewRepository` — upsert by `projectId` (lastEventAt guard), `listUnaligned` (status=Active AND aligned=false), investment-mix aggregation (GROUP BY goal / portfolio, SUM plannedBudget) — M
  - [x] 3.6 Repository unit tests — M

- [x] 4. Domain Services
  - [x] 4.1 `StrategicGoalService` — `createGoal()` (required-field validation, audit), `listGoals()`, `archiveGoal()` — M
  - [x] 4.2 `PortfolioService` — `createPortfolio()` (owner=creator from AuthContext, emit `portfolio.created`, audit), `listPortfolios()` (scoped), `getPortfolio()`, `associateGoals()` (idempotent) — M
  - [x] 4.3 `ProgramService` — `createProgram()` (requires parent portfolio, emit `program.created`, audit), `listPrograms()`, `programExists()` in-process API — M
  - [x] 4.4 `GoalLinkService` — `linkProjectToGoals()` (idempotent, emit `project.linked-to-goal`, recompute alignment, audit), `unlinkGoal()` — M
  - [x] 4.5 `AlignmentService` — `evaluateAlignment()` (aligned iff ≥1 GoalLink; update projection; on unaligned+active emit `project.flagged-unaligned`), `listUnaligned()` (owner+portfolio join) — M
  - [x] 4.6 `InvestmentMixService` — `getInvestmentMix(groupBy)` aggregation over projection + GoalLink + Portfolio (null budget → 0) — M

- [x] 5. PBT & Unit Tests
  - [x] 5.1 PBT P1: investment-mix total-preserving — group sums == in-scope sum, counts partition (100 runs) — M
  - [x] 5.2 PBT P2: alignment exhaustive/deterministic — `evaluateAlignment == (linkCount ≥ 1)`, total + idempotent (100 runs) — M
  - [x] 5.3 PBT P3: link idempotency — double link/associate == single, no dup rows, no error (100 runs) — S

- [x] 6. Event Subscriber & Publisher
  - [x] 6.1 `ProjectAlignmentProjector` — subscribe `project-execution.project.created` + `project-execution.project.status-changed`; idempotent (`makeIdempotent`/ledger); upsert `ProjectAlignmentView` (lastEventAt guard); call `AlignmentService.evaluateAlignment` — M
  - [x] 6.2 Outbox publication wiring for the 4 `strategy-portfolio.*` events (`OutboxWriter.enqueue` in-tx + relay) — S
  - [x] 6.3 Subscriber tests — replay same event → no duplicate; out-of-order (stale `lastEventAt`) ignored — S

- [x] 7. Controllers & Module
  - [x] 7.1 `StrategicGoalController` — POST `/strategy/goals` (Director), GET `/strategy/goals`, POST `/strategy/goals/:id/archive` · `ZodValidationPipe` + `AuthGuard` + `@RequirePermission()` — S
  - [x] 7.2 `PortfolioController` — POST/GET `/strategy/portfolios`, GET `/:id`, POST `/:id/goals`, POST/GET `/:id/programs` (PM) — M
  - [x] 7.3 `GoalLinkController` — POST `/strategy/goal-links`, DELETE `/strategy/goal-links/:id` (PM) — S
  - [x] 7.4 `AlignmentController` — GET `/strategy/alignment/unaligned` (Director, US-010) — S
  - [x] 7.5 `InvestmentMixController` — GET `/strategy/investment-mix?groupBy=goal|portfolio` (PM, US-009) — S
  - [x] 7.6 `StrategyPortfolioModule` — register providers, export `ProgramService` + `PortfolioService`, RBAC grants; register in `AppModule` (before project-execution) — S

- [x] 8. Integration Tests
  - [x] 8.1 Goal → portfolio → associate goals → program creation flow — M
  - [x] 8.2 Link project→goal → aligned; project.created/status-changed→Active with no link → `flagged-unaligned` published + projection `aligned=false` — M
  - [x] 8.3 Investment-mix aggregation by goal and by portfolio (count + planned-budget) — M
  - [x] 8.4 Unaligned report lists active unlinked projects w/ owner+portfolio; empty → fully-aligned — S
  - [x] 8.5 Projection idempotency & order tolerance: replay + stale event → no corruption — S
  - [x] 8.6 Record-scope: Portfolio Manager cannot see another PM's portfolios; audit rows on mutations; `GET /health` green with module registered — M

---

## Execution Waves

### Wave 1
- **Phase 1** — Shared Types — owns: `packages/shared/src/types/strategy-portfolio.ts`, `errors/strategy-error-codes.ts`

### Wave 2
- **Phase 2** — Database Schema — owns: `packages/db/prisma/schema.prisma` (strategy models), migration `0005_strategy_init`
- _(Phase 1 must be complete first)_

### Wave 3
- **Phase 3** — Repositories — owns: `apps/api/src/modules/strategy-portfolio/repositories/`
- _(Phase 2 first; all repos parallelizable by file)_

### Wave 4 (parallelizable within)
- **Phase 4** — Domain Services — owns: `services/`
- **Phase 5** — PBT & Unit Tests — owns: `__tests__/*.service.test.ts`, `__tests__/pbt.test.ts`
- _(Services + their tests/PBT develop together)_

### Wave 5 (sequential)
- **Phase 6** — Event Subscriber & Publisher — owns: `events/`
- **Phase 7** — Controllers & Module — owns: `controllers/`, `strategy-portfolio.module.ts`, `app.module.ts`
- **Phase 8** — Integration Tests — owns: `__tests__/strategy-portfolio.int.test.ts`
- _(Controllers depend on services; integration tests run last)_

---

## Definition of Done

- [ ] All 6 user stories (US-006…US-011) pass integration tests
- [ ] PBT properties P1–P3 green (100 runs each)
- [ ] `@epm/shared` exports new DTOs, Zod schemas, error codes (`STRATEGY_001–006`), event payloads
- [ ] Migration `0005_strategy_init` committed and applied (or gracefully skipped without Postgres)
- [ ] All endpoints return RFC 7807 on error paths (tested)
- [ ] Record-scope enforcement verified (PM cannot access other PM's portfolios; Director sees all)
- [ ] Alignment: activating a project with no GoalLink flags it unaligned and publishes the event
- [ ] Investment-mix aggregation total-preserving (P1) and indexed for p95 < 300ms
- [ ] Event projection idempotent + order-tolerant (replay/stale event tolerated)
- [ ] Audit entries written on every mutation
- [ ] `GET /health` green with `StrategyPortfolioModule` registered
- [ ] TypeScript strict — no `any`; ESLint + Prettier pass
- [ ] CI green (lint → test → integration → build)
