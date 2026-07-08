# Components — strategy-portfolio

## Summary

The `strategy-portfolio` unit is a NestJS module at `apps/api/src/modules/strategy-portfolio/`
(mirroring the `project-execution` layout: `controllers/`, `services/`, `repositories/`,
`events/`, `__tests__/`, `strategy-portfolio.module.ts`). It owns strategic goals/OKRs,
portfolios, programs, project→goal links, and a local **read-model** (`ProjectAlignmentView`)
that is projected from `project-execution` domain events — the unit never reads execution's
DB or API directly (D3-1).

Components and the stories they serve:

| Component | Type | Stories |
|-----------|------|---------|
| `StrategicGoalService` | service | US-006 |
| `PortfolioService` | service | US-007 |
| `ProgramService` | service | US-011 |
| `GoalLinkService` | service | US-008 |
| `AlignmentService` | service | US-008, US-010 |
| `InvestmentMixService` | service | US-009 |
| `ProjectAlignmentProjector` | event subscriber | US-008, US-009, US-010 (feeds projection) |
| `StrategicGoalRepository` | repository (Prisma) | US-006 |
| `PortfolioRepository` (+ PortfolioGoal) | repository (Prisma) | US-007 |
| `ProgramRepository` | repository (Prisma) | US-011 |
| `GoalLinkRepository` | repository (Prisma) | US-008 |
| `ProjectAlignmentViewRepository` | repository (Prisma) | US-008/09/10 |
| `StrategicGoalController` | REST adapter | US-006 |
| `PortfolioController` (+ goals + programs sub-routes) | REST adapter | US-007, US-011 |
| `GoalLinkController` | REST adapter | US-008 |
| `AlignmentController` | REST adapter | US-010 |
| `InvestmentMixController` | REST adapter | US-009 |
| `StrategyPortfolioModule` | NestJS module | all |

All mutations are audited (foundation `AuditService`), all inputs Zod-validated, all
publishes go through the transactional outbox, and all subscriptions are idempotent
(foundation idempotency ledger, dedupe by `eventId`).

## Module Overview

```
StrategyPortfolioModule (NestJS)
├── StrategicGoalController      REST adapter — /strategy/goals/**
├── PortfolioController          REST adapter — /strategy/portfolios/** (+ /goals, /programs sub-routes)
├── GoalLinkController           REST adapter — /strategy/goal-links/**
├── AlignmentController          REST adapter — /strategy/alignment/**
├── InvestmentMixController      REST adapter — /strategy/investment-mix
├── StrategicGoalService         Command/query handler — goals & OKRs
├── PortfolioService             Command/query handler — portfolios + goal association
├── ProgramService               Command/query handler — programs (+ programExists module-API)
├── GoalLinkService              Command handler — project↔goal links, triggers realignment
├── AlignmentService             Domain logic — evaluate alignment, list unaligned
├── InvestmentMixService         Read-side — on-demand investment-mix aggregation
├── StrategicGoalRepository      Prisma — strategy.strategic_goal
├── PortfolioRepository          Prisma — strategy.portfolio + strategy.portfolio_goal
├── ProgramRepository            Prisma — strategy.program
├── GoalLinkRepository           Prisma — strategy.goal_link
├── ProjectAlignmentViewRepository  Prisma — strategy.project_alignment_view
└── ProjectAlignmentProjector    Subscribes to: project-execution.project.created,
                                              project-execution.project.status-changed
```

## Component Interfaces

### StrategicGoalService (US-006)

Owns strategic goals / OKRs. `createGoal` rejects on any missing required field
(`title`, `description`, `measure`) with a validation error.

```typescript
interface IStrategicGoalService {
  createGoal(cmd: DefineStrategicGoalCommand, ctx: AuthContext, requestId: string): Promise<StrategicGoalDTO>;
  listGoals(ctx: AuthContext): Promise<StrategicGoalDTO[]>;
  archiveGoal(id: string, ctx: AuthContext, requestId: string): Promise<void>;
}
```

Dependencies: `StrategicGoalRepository`, `AuditService`.

### PortfolioService (US-007)

Owns portfolios and the many-to-many association to strategic goals (via `PortfolioGoal`).
On `createPortfolio` the caller becomes the `ownerId`. `associateGoals` is an idempotent
upsert over the `PortfolioGoal` join (set semantics via `@@unique([portfolioId, goalId])`).
Non-Director reads are record-scoped to `ownerId`.

```typescript
interface IPortfolioService {
  createPortfolio(cmd: CreatePortfolioCommand, ctx: AuthContext, requestId: string): Promise<PortfolioDTO>;
  listPortfolios(ctx: AuthContext): Promise<PortfolioDTO[]>;
  getPortfolio(id: string, ctx: AuthContext): Promise<PortfolioDTO>;
  associateGoals(portfolioId: string, goalIds: string[], ctx: AuthContext, requestId: string): Promise<PortfolioDTO>;
}
```

Dependencies: `PortfolioRepository`, `StrategicGoalRepository` (goal existence check),
`AuditService`, `EventBus` (publishes `strategy-portfolio.portfolio.created`).

### ProgramService (US-011)

Owns programs, each within a required parent portfolio (`Program.portfolioId`, D3-6).
Exposes `programExists` as an **in-process module-API** so `project-execution` can validate
its soft `programId` reference without a cross-schema FK.

```typescript
interface IProgramService {
  createProgram(portfolioId: string, cmd: CreateProgramCommand, ctx: AuthContext, requestId: string): Promise<ProgramDTO>;
  listPrograms(portfolioId: string, ctx: AuthContext): Promise<ProgramDTO[]>;
  programExists(programId: string): Promise<boolean>;
}
```

Dependencies: `ProgramRepository`, `PortfolioRepository` (parent existence + scope),
`AuditService`, `EventBus` (publishes `strategy-portfolio.program.created`).

### GoalLinkService (US-008)

Links a project to one or more strategic goals. `linkProjectToGoals` is an idempotent
upsert (set semantics via `@@unique([goalId, projectId])`, D3-2/P3). After linking it
recomputes alignment for the project and updates the projection, then publishes
`strategy-portfolio.project.linked-to-goal`.

```typescript
interface IGoalLinkService {
  linkProjectToGoals(projectId: string, goalIds: string[], linkedBy: string, ctx: AuthContext, requestId: string): Promise<GoalLinkDTO[]>;
  unlinkGoal(id: string, ctx: AuthContext, requestId: string): Promise<void>;
}
```

Dependencies: `GoalLinkRepository`, `StrategicGoalRepository` (goal existence),
`AlignmentService` (recompute after link/unlink), `AuditService`, `EventBus`.

### AlignmentService (US-008 / US-010)

Pure domain logic over links + projection. `evaluateAlignment` is a total, deterministic
boolean function — `Aligned` iff `GoalLink count ≥ 1` for the `projectId` (P2). When a
project is active and unaligned it publishes `strategy-portfolio.project.flagged-unaligned`
(D3-4). `listUnaligned` returns the projection rows where `status = Active AND aligned = false`,
enriched with owner and portfolio (US-010).

```typescript
interface IAlignmentService {
  evaluateAlignment(projectId: string): Promise<AlignmentStatus>;   // 'Aligned' | 'Unaligned'
  recomputeAndPersist(projectId: string, requestId: string): Promise<boolean>; // returns aligned; updates view; flags if unaligned+active
  listUnaligned(ctx: AuthContext): Promise<UnalignedReportDTO>;
}
```

Dependencies: `GoalLinkRepository`, `ProjectAlignmentViewRepository`, `EventBus`.

### InvestmentMixService (US-009)

On-demand aggregation (no materialized store, D3-5) over `ProjectAlignmentView` + `GoalLink`
+ `Portfolio`. Groups by `goal` or `portfolio`, returning per-group project count and
`SUM(plannedBudget)` (P1 total-preserving; a project linked to N goals expands to N
goal-groups by design).

```typescript
interface IInvestmentMixService {
  getInvestmentMix(groupBy: 'goal' | 'portfolio', ctx: AuthContext): Promise<InvestmentSummary[]>;
}
```

Dependencies: `ProjectAlignmentViewRepository`, `GoalLinkRepository`, `StrategicGoalRepository`,
`PortfolioRepository`.

### ProjectAlignmentProjector (event subscriber — US-008/09/10)

Subscribes to `project-execution.project.created` and `project-execution.project.status-changed`.
Each handler is wrapped with `makeIdempotent(...)` (foundation idempotency ledger, keyed by
`eventId`) and upserts `ProjectAlignmentView` by `projectId`, guarding against out-of-order /
duplicate delivery with `lastEventAt` (resiliency-baseline). After upsert it delegates to
`AlignmentService.recomputeAndPersist` so a newly-active-but-unlinked project is flagged.

```typescript
class ProjectAlignmentProjector implements OnModuleInit {
  onModuleInit(): void;   // registers the two subscriptions
  // handlers (internal):
  private onProjectCreated(event: DomainEvent<ProjectCreatedPayload>): Promise<void>;
  private onStatusChanged(event: DomainEvent<StatusChangedPayload>): Promise<void>;
}
```

Dependencies: `EVENT_BUS`, `PrismaService`, `ProjectAlignmentViewRepository`,
`AlignmentService`, idempotency ledger (`STRATEGY_IDEMPOTENCY_LEDGER` DI token).

## Repositories (Prisma)

| Repository | Backing table(s) | Key methods |
|------------|------------------|-------------|
| `StrategicGoalRepository` | `strategy.strategic_goal` | `create`, `findById`, `findByIdOrThrow`, `listActive`, `archive`, `existsById` |
| `PortfolioRepository` | `strategy.portfolio`, `strategy.portfolio_goal` | `create`, `findByIdScoped`, `findMany(ctx)`, `associateGoals(portfolioId, goalIds[])` (idempotent upsert), `listGoalIds(portfolioId)` |
| `ProgramRepository` | `strategy.program` | `create`, `findById`, `existsById`, `listByPortfolio(portfolioId)` |
| `GoalLinkRepository` | `strategy.goal_link` | `upsertLink(goalId, projectId, linkedBy)` (idempotent), `delete(id)`, `countByProject(projectId)`, `findByProject(projectId)`, `findGoalIdsByProject(projectId)` |
| `ProjectAlignmentViewRepository` | `strategy.project_alignment_view` | `upsertByProjectId(view, lastEventAt)` (guarded), `setAligned(projectId, aligned)`, `findByProject(projectId)`, `listUnaligned()`, `listForMix(scope)` |

All repositories extend the foundation `BaseRepository` with `readonly schema = "strategy"`.
`PortfolioGoal` has no dedicated repository — it is handled inside `PortfolioRepository`.

## Controllers

| Controller | Base route | Endpoints (→ service) |
|------------|-----------|-----------------------|
| `StrategicGoalController` | `/strategy/goals` | `POST /` → createGoal · `GET /` → listGoals · `POST /:id/archive` → archiveGoal |
| `PortfolioController` | `/strategy/portfolios` | `POST /` → createPortfolio · `GET /` → listPortfolios · `GET /:id` → getPortfolio · `POST /:id/goals` → associateGoals · `POST /:id/programs` → createProgram · `GET /:id/programs` → listPrograms |
| `GoalLinkController` | `/strategy/goal-links` | `POST /` → linkProjectToGoals · `DELETE /:id` → unlinkGoal |
| `AlignmentController` | `/strategy/alignment` | `GET /unaligned` → listUnaligned |
| `InvestmentMixController` | `/strategy/investment-mix` | `GET /` → getInvestmentMix |

Every route is guarded by the foundation RBAC guard; see the Permission Matrix below.

## In-Process API (consumed by other units)

`StrategyPortfolioModule` exports `ProgramService` (and `PortfolioService`) as NestJS
providers so `project-execution` can validate its soft `programId` / `portfolioId`
references in-process — no HTTP hop, no cross-schema FK (D3-6). Soft-ref validation
degrades gracefully (resiliency-baseline).

```typescript
// Public in-process API exposed from this module
export { IProgramService, IPortfolioService, ProgramDTO, PortfolioDTO };
```

## Domain Events

### Published (via outbox)

| Event | Payload | Trigger |
|-------|---------|---------|
| `strategy-portfolio.portfolio.created` | `{ portfolioId, ownerId, name }` | `PortfolioService.createPortfolio` |
| `strategy-portfolio.program.created` | `{ programId, portfolioId, name }` | `ProgramService.createProgram` |
| `strategy-portfolio.project.linked-to-goal` | `{ projectId, goalIds, linkedBy }` | `GoalLinkService.linkProjectToGoals` |
| `strategy-portfolio.project.flagged-unaligned` | `{ projectId, portfolioId?, status }` | `AlignmentService` when active + unaligned (D3-4) |

### Subscribed

| Event | Source | Handler |
|-------|--------|---------|
| `project-execution.project.created` | project-execution | `ProjectAlignmentProjector.onProjectCreated` → upsert view + evaluate |
| `project-execution.project.status-changed` | project-execution | `ProjectAlignmentProjector.onStatusChanged` → upsert view + evaluate |

Idempotent handling via foundation idempotency (dedupe by `eventId`); projection tolerates
out-of-order / duplicate events (upsert by `projectId`, guarded by `lastEventAt`).

## Permission Matrix

| Action | EPMO Director | Portfolio Manager | Others |
|--------|:---:|:---:|:---:|
| Create / archive strategic goal | ✅ | ❌ | ❌ |
| List strategic goals | ✅ | ✅ | ❌ |
| Create / manage portfolio | ✅ (all) | ✅ (own — `ownerId` scope) | ❌ |
| Read portfolio | ✅ (all) | ✅ (own) | ❌ |
| Associate goals to portfolio | ✅ | ✅ (own) | ❌ |
| Create / list programs | ✅ | ✅ (own portfolio) | ❌ |
| Link / unlink project ↔ goal | ✅ | ✅ | ❌ |
| View investment-mix | ✅ | ✅ | ❌ |
| View unaligned-work report | ✅ | ❌ | ❌ |

Record scoping: non-Director access to portfolios (and their programs) is limited to
`Portfolio.ownerId`. All mutations are written to the foundation audit trail. No PII beyond
`userId`s is stored (security-baseline).
