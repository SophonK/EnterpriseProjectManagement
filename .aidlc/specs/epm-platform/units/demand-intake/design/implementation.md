# Implementation — demand-intake

## Summary

`demand-intake` is a NestJS module under `apps/api/src/modules/demand-intake/`, laid out like `project-execution` and `strategy-portfolio` (`controllers/`, `services/`, `repositories/`, `events/`, `dto/`, `__tests__/`, `demand-intake.module.ts`). It owns six services (`DemandRequestService`, `ScoringModelService`, `ScoringService`, `ScoreCalculator`, `StageGateService`, `PromotionService`), four Prisma repositories, five controllers, an event publisher (no subscriber — D3-7), and Zod DTOs. Persistence is the `intake` Postgres schema (six models + three enums) added to `packages/db/prisma/schema.prisma` under migration `0006_intake_init`. The module imports the foundation `EventsModule`, `AuthModule`, and `DbModule`, and is registered in `app.module.ts` after `project-execution` (whose subscriber already consumes `demand-intake.demand.promoted`). Implementation proceeds bottom-up: shared types → Prisma migration → repositories → services (with PBT) → publisher → controllers → module registration. `ScoreCalculator` is the pure-function PBT surface (P1, P2); the `StageGateService` state machine is the P3 surface.

## Directory Layout

```
apps/api/src/modules/demand-intake/
├── demand-intake.module.ts                 NestJS module; imports EventsModule, AuthModule, DbModule
├── controllers/
│   ├── demand-request.controller.ts        POST/GET /intake/requests(/:id)
│   ├── scoring-model.controller.ts         POST /intake/scoring-models, GET /intake/scoring-models/active
│   ├── scoring.controller.ts               POST /intake/requests/:id/score, GET /intake/requests/ranked
│   ├── stage-gate.controller.ts            POST /intake/requests/:id/advance, POST /intake/requests/:id/reject
│   └── promotion.controller.ts             POST /intake/requests/:id/promote
├── services/
│   ├── demand-request.service.ts           submitIntake (DEMAND_001 required-field), getRequest, listRequests (US-029)
│   ├── scoring-model.service.ts            configureScoring (single active version), getActiveModel, listCriteria (US-030)
│   ├── scoring.service.ts                  scoreRequest (upsert ScoreCard), rankRequests (US-030)
│   ├── score-calculator.ts                 PURE: computeWeightedTotal(criteria[], scores[]) → 0–100 (P1); rank(requests[]) (P2)
│   ├── stage-gate.service.ts               advanceGate (per-gate RBAC, state machine), rejectGate (US-031; P3)
│   └── promotion.service.ts                promoteToProject (require Approved; publish demand.promoted) (US-032)
├── repositories/
│   ├── demand-request.repository.ts        Prisma CRUD over DemandRequest
│   ├── scoring-model.repository.ts         Prisma CRUD over ScoringModel + ScoringCriterion; single-active activation
│   ├── score-card.repository.ts            Prisma upsert/read over ScoreCard + CriterionScore
│   └── gate-decision.repository.ts         Prisma create/list over GateDecision
├── events/
│   └── demand-intake-event.pub.ts          publish helpers (DemandSubmitted, DemandApproved, DemandRejected, DemandPromoted) via eventBus.publish
├── dto/
│   ├── submit-intake.dto.ts                Zod schema + type {title, sponsor, description, expectedValue?}
│   ├── configure-scoring.dto.ts            {name, criteria:[{name, weight, maxScore?, goalId?}]}
│   ├── score-and-rank.dto.ts               {scores:[{criterionId, rawScore}]}
│   ├── advance-gate.dto.ts                 {} (empty body; transition inferred from currentGate)
│   ├── reject-gate.dto.ts                  {reason}
│   └── promote-to-project.dto.ts           {portfolioId, plannedStart, plannedEnd, plannedBudget?, programId?}
└── __tests__/
    ├── demand-request.service.spec.ts       Unit tests (submit required-field DEMAND_001, record scoping)
    ├── scoring-model.service.spec.ts        Unit tests (single-active versioning)
    ├── scoring.service.spec.ts              Unit tests
    ├── score-calculator.spec.ts             PBT P1 (weighted-score bounded/correct) + P2 (ranking total order) via fast-check
    ├── stage-gate.service.spec.ts           Unit tests + PBT P3 (transition validity, terminal states)
    ├── promotion.service.spec.ts            Unit tests (require Approved, exact promoted payload)
    ├── demand-intake.repository.spec.ts     Repository tests (Testcontainers)
    └── demand-intake.integration.spec.ts    Testcontainers integration tests (US-029..US-032)
```

## Prisma Migration — `intake` Schema

Added to `packages/db/prisma/schema.prisma` (multi-schema, alongside `execution`/`identity`/`strategy`/`shared`); `intake` is added to the datasource `schemas` array and every model carries `@@schema("intake")`. Migration name: `0006_intake_init`.

Models (byte-identical to the canonical model):
- `DemandRequest` — aggregate root: `id` (uuid pk), `title`, `sponsor`, `description`, `expectedValue` (Decimal?), `status` (enum `DemandStatus` Submitted|Screening|Evaluation|Approved|Promoted|Rejected, default Submitted), `currentGate` (enum `IntakeGate` Submitted|Screening|Evaluation|Approved), `rejectionReason` (String?), `submittedBy` (uuid), `submittedAt` (DateTime), `promotedProjectId` (uuid?, best-effort, NOT required), `createdAt`, `updatedAt`. `@@index([status])`.
- `ScoringModel` — aggregate root: `id`, `name`, `version` (Int), `isActive` (Boolean, default false — only one active), `createdBy` (uuid), `createdAt`, `updatedAt`. `@@index([isActive])`.
- `ScoringCriterion` — `id`, `scoringModelId` (FK→ScoringModel), `name`, `weight` (Decimal), `maxScore` (Int, default 100), `goalId` (uuid?, optional soft ref for strategic-fit, NO FK), `sortOrder` (Int). `@@index([scoringModelId])`.
- `ScoreCard` — `id`, `demandRequestId` (FK→DemandRequest), `scoringModelId` (uuid soft ref to model version used), `weightedTotal` (Decimal, computed 0–100), `scoredBy` (uuid), `scoredAt` (DateTime), `createdAt`, `updatedAt`. `@@unique([demandRequestId])` (one active card per request).
- `CriterionScore` — `id`, `scoreCardId` (FK→ScoreCard), `criterionId` (uuid ref to ScoringCriterion), `rawScore` (Int), `createdAt`. `@@unique([scoreCardId, criterionId])`.
- `GateDecision` — `id`, `demandRequestId` (FK→DemandRequest), `fromGate` (enum IntakeGate), `toGate` (enum IntakeGate?, null on reject), `decision` (enum `GateOutcome` Advanced|Rejected), `reason` (String?), `decidedBy` (uuid), `decidedAt` (DateTime). `@@index([demandRequestId])`.

Enums: `DemandStatus`, `IntakeGate`, `GateOutcome`, all `@@schema("intake")`.

Relations (intra-schema only): `ScoringModel 1—N ScoringCriterion`; `DemandRequest 1—1 ScoreCard`; `ScoreCard 1—N CriterionScore`; `DemandRequest 1—N GateDecision`. Soft refs (`goalId` → strategy, `promotedProjectId` → execution, `scoringModelId` on ScoreCard) carry NO cross-schema FK (D3-1, D3-2).

Migration applied locally via `pnpm db:migrate`.

## Build Order

1. `packages/shared` — add to `packages/shared/src/`:
   - `types/demand-intake.ts` — `DemandRequestDTO`, `ScoringModelDTO`, `ScoringCriterionDTO`, `ScoreCardDTO`, `WeightedScore` ({weightedTotal, rank}), `GateStatus` ({currentGate, allowedNext}).
   - `events/demand-intake-events.ts` — the four `demand-intake.demand.*` payload types; `DemandPromotedPayload` **byte-identical** to project-execution's interface (`{demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget?}`).
   - `errors/demand-error-codes.ts` — codes `DEMAND_001..` (required-field, illegal-transition, not-approved, no-active-model, etc.).
   Follow strategy-portfolio's shared-package pattern exactly.
2. `packages/db` — add the six `intake` Prisma models + three enums; register `intake` in the datasource `schemas` array; migration `0006_intake_init`.
3. `apps/api/src/modules/demand-intake` — implement in order:
   a. Repositories (test with Testcontainers) — `DemandRequestRepository`, `ScoringModelRepository` (+criteria, single-active activation), `ScoreCardRepository` (+CriterionScore upsert), `GateDecisionRepository`.
   b. Pure domain — `ScoreCalculator.computeWeightedTotal` / `rank` (no I/O) with PBT P1 + P2 (fast-check).
   c. Services (unit tests + PBT) — `DemandRequestService`, `ScoringModelService`, `ScoringService`, `StageGateService` (state machine, per-gate RBAC, PBT P3), `PromotionService`.
   d. Event publisher — `demand-intake-event.pub.ts` (publish helpers for submitted/approved/rejected/promoted via `eventBus.publish`).
   e. Controllers — with `AuthGuard` + `@RequirePermission()` (incl. per-gate permission on advance) + Zod DTO validation + RFC7807 errors.
   f. Module registration in `app.module.ts`.

## Module Registration

```typescript
// apps/api/src/app.module.ts
@Module({
  imports: [
    FoundationModule,
    IdentityAccessModule,
    StrategyPortfolioModule,
    ProjectExecutionModule,    // already subscribes to demand-intake.demand.promoted
    DemandIntakeModule,        // publishes demand-intake.demand.* — registered after execution
    // ... downstream units
  ],
})
export class AppModule {}
```

`DemandIntakeModule` imports the foundation `EventsModule` (EventBus), `AuthModule` (AuthGuard, IAuthService, AuditService), and `DbModule` (PrismaService); it provides all services, the pure `ScoreCalculator`, the four repositories, five controllers, and the `demand-intake-event.pub.ts` publisher. It registers **no** event subscriber and **no** idempotency ledger (D3-7 — publisher only). Ordering vs `ProjectExecutionModule` is immaterial for correctness because delivery is in-process pub/sub, but it is listed after execution to reflect the dependency direction (execution consumes intake's promote event).

## Definition of Done

- [ ] All 4 user stories (US-029..US-032) have passing integration tests
- [ ] PBT properties P1–P3 pass (fast-check): P1 weighted-score bounded/correct, P2 ranking deterministic total order, P3 stage-gate transition validity
- [ ] `packages/shared` exports the demand-intake DTOs, `WeightedScore`/`GateStatus`, the four event payload types (`DemandPromotedPayload` byte-identical to execution's), and error codes `DEMAND_001..`
- [ ] Migration `0006_intake_init` applied to local Postgres via `pnpm db:migrate`; `intake` registered in the datasource `schemas` array
- [ ] `demand-intake.demand.promoted` payload is byte-identical to project-execution's `DemandPromotedPayload` (verified in integration test against the existing subscriber)
- [ ] Promote is retry-safe: re-publishing does not create a duplicate Project (execution dedupes by `sourceDemandId`) — verified in integration test
- [ ] All endpoints enforce JWT + RBAC; advance enforces per-gate permission (`intake-gate:*`); return RFC 7807 errors on failure paths
- [ ] Record scoping on `GET /intake/requests` verified (non-Director scoped to `submittedBy`)
- [ ] Audit trail entries written for submit/score/advance/reject/promote (verified in integration test)
- [ ] Single-active `ScoringModel` invariant enforced (activating a new version deactivates the prior)
- [ ] Ranked-list query hits the `status` index; portfolio-scale p95 < 300ms
- [ ] `GET /health` still passes with the module registered
- [ ] TypeScript strict mode: no `any`, no implicit `any`
- [ ] ESLint + Prettier pass
- [ ] CI pipeline green (lint → test → integration → build)
