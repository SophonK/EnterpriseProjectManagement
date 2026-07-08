# Implementation — strategy-portfolio

## Summary

`strategy-portfolio` is a NestJS module under `apps/api/src/modules/strategy-portfolio/`, laid out like `project-execution` (`controllers/`, `services/`, `repositories/`, `events/`, `dto/`, `__tests__/`, `strategy-portfolio.module.ts`). It owns seven services (`StrategicGoalService`, `PortfolioService`, `ProgramService`, `GoalLinkService`, `AlignmentService`, `InvestmentMixService`, `ProjectAlignmentProjector`), five Prisma repositories, five controllers, an event subscriber + publisher, and Zod DTOs. Persistence is the `strategy` Postgres schema (six models) added to `packages/db/prisma/schema.prisma` under one migration. The module imports the foundation `EventsModule`, `AuthModule`, and `DbModule`, and is registered in `app.module.ts`. Implementation proceeds bottom-up: shared types → Prisma migration → repositories → services (with PBT) → projector/publisher → controllers → module registration.

## Directory Layout

```
apps/api/src/modules/strategy-portfolio/
├── strategy-portfolio.module.ts           NestJS module; imports EventsModule, AuthModule, DbModule; exports IStrategyPortfolioService
├── controllers/
│   ├── strategic-goal.controller.ts        POST/GET /strategy/goals, POST /strategy/goals/:id/archive
│   ├── portfolio.controller.ts             POST/GET /strategy/portfolios(/:id), POST /strategy/portfolios/:id/goals, POST/GET /strategy/portfolios/:id/programs
│   ├── goal-link.controller.ts             POST /strategy/goal-links, DELETE /strategy/goal-links/:id
│   ├── alignment.controller.ts             GET /strategy/alignment/unaligned
│   └── investment-mix.controller.ts        GET /strategy/investment-mix?groupBy=goal|portfolio
├── services/
│   ├── strategic-goal.service.ts           createGoal, listGoals, archiveGoal (US-006)
│   ├── portfolio.service.ts                createPortfolio (creator→owner), listPortfolios, getPortfolio, associateGoals (US-007)
│   ├── program.service.ts                  createProgram, listPrograms, programExists (US-011; module-API for execution)
│   ├── goal-link.service.ts                linkProjectToGoals (idempotent), unlinkGoal; recompute alignment (US-008)
│   ├── alignment.service.ts                evaluateAlignment, listUnaligned (US-008/US-010)
│   └── investment-mix.service.ts           getInvestmentMix (US-009)
├── repositories/
│   ├── strategic-goal.repository.ts        Prisma CRUD over StrategicGoal
│   ├── portfolio.repository.ts             Prisma CRUD over Portfolio + PortfolioGoal join upserts
│   ├── program.repository.ts               Prisma CRUD over Program
│   ├── goal-link.repository.ts             Prisma upsert/delete over GoalLink (set semantics)
│   └── project-alignment-view.repository.ts  Upsert/read of ProjectAlignmentView + aggregation queries
├── events/
│   ├── strategy-portfolio-event.sub.ts     ProjectAlignmentProjector — subscribes project.created / project.status-changed
│   └── strategy-portfolio-event.pub.ts     publish helpers (PortfolioCreated, ProgramCreated, ProjectLinkedToGoal, ProjectFlaggedUnaligned) via outbox
├── dto/
│   ├── define-strategic-goal.dto.ts        Zod schema + inferred type {title, description, measure}
│   ├── create-portfolio.dto.ts             {name, description?}
│   ├── associate-goals.dto.ts              {goalIds[]}
│   ├── create-program.dto.ts               {name, description?}
│   ├── link-project-to-goal.dto.ts         {projectId, goalIds[]}
│   └── investment-mix-query.dto.ts         {groupBy: 'goal'|'portfolio'}
└── __tests__/
    ├── strategic-goal.service.spec.ts       Unit tests
    ├── portfolio.service.spec.ts            Unit tests + P3 (associateGoals idempotency)
    ├── goal-link.service.spec.ts            Unit tests + P3 (link idempotency)
    ├── alignment.service.spec.ts            Unit tests + P2 (alignment deterministic/total)
    ├── investment-mix.service.spec.ts       Unit tests + P1 (total-preserving)
    ├── project-alignment-projector.spec.ts  Event-subscriber test (idempotent upsert, out-of-order guard)
    ├── strategy-portfolio.repository.spec.ts Repository tests (Testcontainers)
    └── strategy-portfolio.integration.spec.ts  Testcontainers integration tests (US-006..US-011)
```

## Prisma Migration — `strategy` Schema

Added to `packages/db/prisma/schema.prisma` (multi-schema, alongside `execution`/`identity`/`shared`); every model carries `@@schema("strategy")`. Migration name: `YYYYMMDD_strategy_init`.

Models (byte-identical to the canonical model):
- `StrategicGoal` — aggregate root: `id` (uuid pk), `title`, `description`, `measure`, `status` (enum `GoalStatus` Active|Archived, default Active), `createdBy` (uuid), `createdAt`, `updatedAt`.
- `Portfolio` — aggregate root: `id`, `name`, `description?`, `ownerId` (uuid), `status` (enum `PortfolioStatus` Active|Archived, default Active), `createdAt`, `updatedAt`.
- `Program` — `id`, `portfolioId` (FK→Portfolio, required), `name`, `description?`, `status` (enum `ProgramStatus` Active|Archived, default Active), `createdAt`, `updatedAt`. `@@index([portfolioId])`.
- `PortfolioGoal` — M:N join: `id`, `portfolioId` (FK→Portfolio), `goalId` (FK→StrategicGoal), `createdAt`. `@@unique([portfolioId, goalId])`.
- `GoalLink` — `id`, `goalId` (FK→StrategicGoal), `projectId` (uuid soft ref, NO FK), `linkedBy` (uuid), `createdAt`. `@@unique([goalId, projectId])`, `@@index([projectId])`.
- `ProjectAlignmentView` — read-model: `projectId` (uuid PK, soft ref), `name`, `status` (string), `plannedBudget` (Decimal?), `portfolioId` (uuid? soft ref), `programId` (uuid? soft ref), `aligned` (boolean, default false), `lastEventAt`, `updatedAt`. `@@index([status])`, `@@index([portfolioId])`.

Enums: `GoalStatus`, `PortfolioStatus`, `ProgramStatus` (each `Active | Archived`), all `@@schema("strategy")`.

Relations: `Portfolio 1—N Program`; `Portfolio N—M StrategicGoal` via `PortfolioGoal`; `StrategicGoal 1—N GoalLink`. No FK crosses into the `execution` schema (D3-2).

Migration applied locally via `pnpm db:migrate`.

## Build Order

1. `packages/shared` — add `StrategicGoalDTO`, `PortfolioDTO`, `ProgramDTO`, `GoalLinkDTO`, `InvestmentSummary`, `AlignmentStatus`, the four `strategy-portfolio.*` event payload types, the two subscribed payload types, and error codes `STRATEGY_001–004`.
2. `packages/db` — add the six `strategy` Prisma models + enums + migration `YYYYMMDD_strategy_init`.
3. `apps/api/src/modules/strategy-portfolio` — implement in order:
   a. Repositories (test with Testcontainers) — `StrategicGoalRepository`, `PortfolioRepository` (incl. PortfolioGoal), `ProgramRepository`, `GoalLinkRepository`, `ProjectAlignmentViewRepository`.
   b. Services (unit tests + PBT) — `StrategicGoalService`, `PortfolioService`, `ProgramService`, `GoalLinkService`, `AlignmentService`, `InvestmentMixService`. PBT: P1 (investment-mix total-preserving), P2 (alignment deterministic/total), P3 (link/associate idempotency) with fast-check.
   c. Event subscriber + publisher — `ProjectAlignmentProjector` (subscribe `project-execution.project.created` / `.status-changed`, idempotent via `makeIdempotent`), `strategy-portfolio-event.pub.ts` (outbox publish helpers).
   d. Controllers — with `AuthGuard` + `@RequirePermission()` + Zod DTO validation + RFC7807 errors.
   e. Module registration in `app.module.ts`.

## Module Registration

```typescript
// apps/api/src/app.module.ts
@Module({
  imports: [
    FoundationModule,
    IdentityAccessModule,
    StrategyPortfolioModule,   // exports IStrategyPortfolioService; imported before project-execution
    ProjectExecutionModule,    // injects IStrategyPortfolioService for soft-ref validation
    // ... downstream units
  ],
})
export class AppModule {}
```

`StrategyPortfolioModule` imports the foundation `EventsModule` (EventBus, OutboxWriter, idempotency), `AuthModule` (AuthGuard, IAuthService, AuditService), and `DbModule` (PrismaService); it provides all services, repositories, controllers, `ProjectAlignmentProjector` (with `STRATEGY_IDEMPOTENCY_LEDGER` provider defaulting to `PrismaIdempotencyLedger`), and exports `IStrategyPortfolioService`.

## Definition of Done

- [ ] All 6 user stories (US-006..US-011) have passing integration tests
- [ ] PBT properties P1–P3 pass (fast-check)
- [ ] `packages/shared` exports new DTOs, `InvestmentSummary`, event payload types, error codes `STRATEGY_001–004`
- [ ] Migration `YYYYMMDD_strategy_init` applied to local Postgres via `pnpm db:migrate`
- [ ] All endpoints enforce JWT + RBAC and return RFC 7807 errors on failure paths
- [ ] Record scoping on `/strategy/portfolios*` verified (non-Director scoped to `ownerId`)
- [ ] Audit trail entries written for every mutation (verified in integration test)
- [ ] `ProjectAlignmentProjector` upsert is idempotent and out-of-order safe (verified in subscriber test)
- [ ] `strategy-portfolio.project.flagged-unaligned` emitted when an active project has no GoalLink (verified in integration test)
- [ ] Investment-mix and unaligned queries hit `status` / `portfolioId` indexes; p95 < 300ms
- [ ] `GET /health` still passes with the module registered
- [ ] TypeScript strict mode: no `any`, no implicit `any`
- [ ] ESLint + Prettier pass
- [ ] CI pipeline green (lint → test → integration → build)
