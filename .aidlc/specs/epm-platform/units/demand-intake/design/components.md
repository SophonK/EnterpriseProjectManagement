# Components — demand-intake

## Summary

The `demand-intake` unit is a NestJS module at `apps/api/src/modules/demand-intake/`
(mirroring the `project-execution` / `strategy-portfolio` layout: `controllers/`,
`services/`, `repositories/`, `events/`, `__tests__/`, `demand-intake.module.ts`). It owns the
demand-request intake pipeline: capturing demand submissions, a single active versioned
weighted **scoring model**, per-request **score cards** with ranking, a fixed linear
**stage-gate** state machine, and promotion of an approved demand into an execution Project.
The unit is fully decoupled from `strategy-portfolio` and `project-execution` — the optional
`goalId` on a criterion is a soft UUID ref (traceability only, never validated at runtime,
D3-1), and promotion is **event-driven**: it publishes `demand-intake.demand.promoted` and
`project-execution` creates the Project idempotently by `sourceDemandId` (D3-2). This unit
subscribes to no events.

Components and the stories they serve:

| Component | Type | Stories |
|-----------|------|---------|
| `DemandRequestService` | service | US-029 |
| `ScoringModelService` | service | US-030 |
| `ScoringService` | service | US-030 |
| `ScoreCalculator` | pure domain helper | US-030 (PBT P1/P2 target) |
| `StageGateService` | service | US-031 |
| `PromotionService` | service | US-032 |
| `DemandRequestRepository` | repository (Prisma) | US-029 |
| `ScoringModelRepository` (+ ScoringCriterion) | repository (Prisma) | US-030 |
| `ScoreCardRepository` (+ CriterionScore) | repository (Prisma) | US-030 |
| `GateDecisionRepository` | repository (Prisma) | US-031 |
| `DemandRequestController` | REST adapter | US-029 |
| `ScoringModelController` | REST adapter | US-030 |
| `ScoringController` | REST adapter | US-030 |
| `StageGateController` | REST adapter | US-031 |
| `PromotionController` | REST adapter | US-032 |
| `DemandIntakeModule` | NestJS module | all |

All mutations are audited (foundation `AuditService`), all inputs Zod-validated, all
publishes go through the transactional outbox, and validation fails closed. This unit has no
event subscriptions and therefore no projector / idempotency ledger of its own.

## Module Overview

```
DemandIntakeModule (NestJS)
├── DemandRequestController      REST adapter — /intake/requests/**
├── ScoringModelController       REST adapter — /intake/scoring-models/**
├── ScoringController            REST adapter — /intake/requests/:id/score, /intake/requests/ranked
├── StageGateController          REST adapter — /intake/requests/:id/advance, /intake/requests/:id/reject
├── PromotionController          REST adapter — /intake/requests/:id/promote
├── DemandRequestService         Command/query handler — submit, get, list demand requests
├── ScoringModelService          Command/query handler — configure & activate versioned scoring model
├── ScoringService               Command/query handler — score a request, ranked list
├── ScoreCalculator              Pure domain logic — weighted total + ranking (no I/O)
├── StageGateService             Domain logic — fixed linear gate state machine, advance/reject
├── PromotionService             Command handler — promote approved demand → project (event-driven)
├── DemandRequestRepository      Prisma — intake.demand_request
├── ScoringModelRepository       Prisma — intake.scoring_model + intake.scoring_criterion
├── ScoreCardRepository          Prisma — intake.score_card + intake.criterion_score
└── GateDecisionRepository       Prisma — intake.gate_decision
```

Publishes only (no subscriptions): `demand-intake.demand.submitted`,
`demand-intake.demand.approved`, `demand-intake.demand.rejected`,
`demand-intake.demand.promoted` (D3-7).

## Component Interfaces

### DemandRequestService (US-029)

Owns the `DemandRequest` aggregate. `submitIntake` rejects on any missing required field
(`title`, `sponsor`, `description`) with `DEMAND_001`, persists the request with
`status = Submitted` and `currentGate = Submitted`, publishes
`demand-intake.demand.submitted`, and audits. Reads are record-scoped: a Portfolio Manager
sees their own submissions (`submittedBy`), an EPMO Director sees all.

```typescript
interface IDemandRequestService {
  submitIntake(cmd: SubmitIntakeCommand, ctx: AuthContext, requestId: string): Promise<DemandRequestDTO>;
  getRequest(id: string, ctx: AuthContext): Promise<DemandRequestDTO>;
  listRequests(ctx: AuthContext): Promise<DemandRequestDTO[]>;
}
```

Dependencies: `DemandRequestRepository`, `AuditService`, `EventBus` (publishes
`demand-intake.demand.submitted`).

### ScoringModelService (US-030)

Owns the versioned scoring model and its weighted criteria. `configureScoring` (EPMO Director
only) creates a **new version** of the `ScoringModel` with its `ScoringCriterion` rows and
activates it, atomically deactivating any previously active model so exactly one model is
active (D3-3). Each criterion may carry an optional soft `goalId` (strategic-fit traceability,
not validated, D3-1).

```typescript
interface IScoringModelService {
  configureScoring(cmd: ConfigureScoringCommand, ctx: AuthContext, requestId: string): Promise<ScoringModelDTO>;
  getActiveModel(ctx: AuthContext): Promise<ScoringModelDTO>;
  listCriteria(scoringModelId: string, ctx: AuthContext): Promise<ScoringCriterionDTO[]>;
}
```

Dependencies: `ScoringModelRepository`, `AuditService`.

### ScoringService (US-030)

Enters per-criterion raw scores for a demand request and computes the weighted total.
`scoreRequest` loads the active `ScoringModel`, validates each `criterionId` belongs to it and
each `rawScore` is within `[0, maxScore]`, delegates the math to `ScoreCalculator`, and
**upserts** the single `ScoreCard` for the request (one card per request, D3-3), replacing its
`CriterionScore` rows. Scoring is only permitted while the request is in `Screening` or
`Evaluation` (D3-5); otherwise `DEMAND_007`. `rankRequests` returns all scored requests
ordered by descending `weightedTotal` with a stable tie-break on `submittedAt` ascending
(delegated to `ScoreCalculator.rank`).

```typescript
interface IScoringService {
  scoreRequest(demandRequestId: string, cmd: ScoreRequestCommand, ctx: AuthContext, requestId: string): Promise<ScoreCardDTO>;
  rankRequests(ctx: AuthContext): Promise<RankedDemandDTO[]>;
}
```

Dependencies: `ScoreCardRepository`, `ScoringModelRepository`, `DemandRequestRepository`,
`ScoreCalculator`, `AuditService`.

### ScoreCalculator (pure domain helper — US-030)

Pure, total, deterministic functions with **no I/O** — the primary PBT surface (P1/P2).
`computeWeightedTotal` normalizes each raw score to its criterion `maxScore`, applies the
relative weights, and returns a value in `[0, 100]`; when `Σweight = 0` it returns a defined
`0` (guarded, never `NaN`, P1). `rank` produces a total order over the input requests
(antisymmetric + transitive), stable tie-broken by `submittedAt` ascending (P2).

```typescript
interface WeightedInput { weight: number; maxScore: number; rawScore: number; }
interface Rankable { demandRequestId: string; weightedTotal: number; submittedAt: string; }

class ScoreCalculator {
  static computeWeightedTotal(inputs: WeightedInput[]): number;               // → 0..100, guarded (P1)
  static rank(requests: Rankable[]): (Rankable & { rank: number })[];         // desc weightedTotal, tie-break submittedAt asc (P2)
}
```

Dependencies: none (pure).

### StageGateService (US-031)

Service-layer state machine over the **fixed linear** gate sequence
`Submitted → Screening → Evaluation → Approved` (D3-4). `advanceGate` checks the caller holds
the per-gate permission for the *target* transition, validates the transition is legal
(forward-only; `Rejected` and `Promoted` are terminal — illegal advance throws `DEMAND_005`
and does not mutate state, P3), moves `currentGate`/`status` forward, records a `GateDecision`
(`decision = Advanced`), and on the final approve (`Evaluation → Approved`) sets
`status = Approved` and publishes `demand-intake.demand.approved`. `rejectGate` is allowed from
any active gate, sets `status = Rejected` + `rejectionReason` (terminal), records a
`GateDecision` (`decision = Rejected`, `toGate = null`), and publishes
`demand-intake.demand.rejected`.

```typescript
interface IStageGateService {
  advanceGate(demandRequestId: string, ctx: AuthContext, requestId: string): Promise<DemandRequestDTO>;
  rejectGate(demandRequestId: string, cmd: RejectGateCommand, ctx: AuthContext, requestId: string): Promise<DemandRequestDTO>;
}
```

Dependencies: `DemandRequestRepository`, `GateDecisionRepository`, `AuditService`,
`EventBus` (publishes `demand-intake.demand.approved`, `demand-intake.demand.rejected`).

### PromotionService (US-032)

Promotes an approved demand into an execution Project. `promoteToProject` requires
`status = Approved` (else `DEMAND_006`), accepts the promotion params the intake form lacks
(`portfolioId`, `plannedStart`, `plannedEnd`, optional `plannedBudget`, optional `programId`),
publishes `demand-intake.demand.promoted` with the **exact** execution payload
`{ demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget? }` (name
defaults from the demand `title`, D3-2), sets `status = Promoted` (terminal), best-effort
records `promotedProjectId` when known, and audits. Safe to retry — `project-execution`
dedupes by `sourceDemandId` (resiliency-baseline).

```typescript
interface IPromotionService {
  promoteToProject(demandRequestId: string, cmd: PromoteToProjectCommand, ctx: AuthContext, requestId: string): Promise<DemandRequestDTO>;
}
```

Dependencies: `DemandRequestRepository`, `AuditService`, `EventBus` (publishes
`demand-intake.demand.promoted`).

## Repositories (Prisma)

| Repository | Backing table(s) | Key methods |
|------------|------------------|-------------|
| `DemandRequestRepository` | `intake.demand_request` | `create`, `findById`, `findByIdOrThrow`, `findByIdScoped(ctx)`, `listScoped(ctx)`, `updateStatusGate(id, status, gate)`, `setRejection(id, reason)`, `setPromoted(id, projectId?)` |
| `ScoringModelRepository` | `intake.scoring_model`, `intake.scoring_criterion` | `createVersionWithCriteria(model, criteria[])` (atomic; deactivates prior active), `findActive`, `nextVersion()`, `listCriteria(scoringModelId)`, `findCriterionIds(scoringModelId)` |
| `ScoreCardRepository` | `intake.score_card`, `intake.criterion_score` | `upsertByDemand(demandRequestId, card, scores[])` (replaces CriterionScore rows), `findByDemand(demandRequestId)`, `listScored()` (join weightedTotal + submittedAt for ranking) |
| `GateDecisionRepository` | `intake.gate_decision` | `record(decision)`, `listByDemand(demandRequestId)` |

All repositories extend the foundation `BaseRepository` with `readonly schema = "intake"`.
`ScoringCriterion` and `CriterionScore` have no dedicated repository — they are handled inside
`ScoringModelRepository` and `ScoreCardRepository` respectively (aggregate-owned).

## Controllers

| Controller | Base route | Endpoints (→ service) |
|------------|-----------|-----------------------|
| `DemandRequestController` | `/intake/requests` | `POST /` → submitIntake · `GET /` → listRequests · `GET /:id` → getRequest |
| `ScoringModelController` | `/intake/scoring-models` | `POST /` → configureScoring · `GET /active` → getActiveModel |
| `ScoringController` | `/intake` | `POST /requests/:id/score` → scoreRequest · `GET /requests/ranked` → rankRequests |
| `StageGateController` | `/intake/requests` | `POST /:id/advance` → advanceGate · `POST /:id/reject` → rejectGate |
| `PromotionController` | `/intake/requests` | `POST /:id/promote` → promoteToProject |

Every route is guarded by the foundation RBAC guard; the `advance` route additionally enforces
the per-gate permission (see the Permission Matrix below). The static
`GET /intake/requests/ranked` route is registered on `ScoringController` and takes precedence
over the `GET /intake/requests/:id` param route on `DemandRequestController`.

## In-Process API (consumed by other units)

None. This unit exposes no in-process module API. All outward contact is via the published
domain events; `project-execution` consumes `demand-intake.demand.promoted` and owns the
resulting Project (D3-2).

## Domain Events

### Published (via outbox)

| Event | Payload | Trigger |
|-------|---------|---------|
| `demand-intake.demand.submitted` | `{ demandId, title, submittedBy }` | `DemandRequestService.submitIntake` |
| `demand-intake.demand.approved` | `{ demandId }` | `StageGateService.advanceGate` on final approve (`Evaluation → Approved`) |
| `demand-intake.demand.rejected` | `{ demandId, reason }` | `StageGateService.rejectGate` |
| `demand-intake.demand.promoted` | `{ demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget? }` | `PromotionService.promoteToProject` — **exact `project-execution` `DemandPromotedPayload` contract** |

### Subscribed

None (D3-7).

The `demand-intake.demand.promoted` payload is byte-identical to `project-execution`'s
`DemandPromotedPayload` interface (`demandId`, `name`, `portfolioId`, `programId?`,
`plannedStart`, `plannedEnd`, `plannedBudget?`); `project-execution` creates the Project
idempotently with `sourceDemandId = demandId`, so re-publishing is safe.

## Permission Matrix

| Action | EPMO Director | Portfolio Manager | Others |
|--------|:---:|:---:|:---:|
| Submit intake request | ✅ | ✅ | ❌ |
| List / read demand requests | ✅ (all) | ✅ (own — `submittedBy` scope) | ❌ |
| Configure scoring model | ✅ | ❌ | ❌ |
| Get active scoring model | ✅ | ✅ | ❌ |
| Score a request | ✅ | ✅ | ❌ |
| View ranked list | ✅ | ✅ | ❌ |
| Advance gate (`Submitted→Screening`) | ✅ | ✅ (`intake-gate:screening`) | ❌ |
| Advance gate (`Screening→Evaluation`) | ✅ | ✅ (`intake-gate:evaluation`) | ❌ |
| Advance gate (`Evaluation→Approved`) | ✅ | ✅ (`intake-gate:approval`) | ❌ |
| Reject gate | ✅ | ✅ | ❌ |
| Promote demand to project | ✅ | ✅ | ❌ |

Per-gate permission map on `advance`: the target transition requires the matching permission —
`intake-gate:screening`, `intake-gate:evaluation`, `intake-gate:approval` (D3-4). Record
scoping: non-Director read access to demand requests is limited to `submittedBy`. All
mutations (submit / score / advance / reject / promote) are written to the foundation audit
trail. No PII beyond `userId`s is stored (security-baseline).
