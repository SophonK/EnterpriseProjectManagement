# Integration — demand-intake

## Summary

`demand-intake` integrates with the rest of the EPM platform through four seams, all mediated by the foundation shared kernel — no direct cross-module database access and no cross-schema foreign keys. (1) Its headline seam is the **promote publication**: `PromotionService.promoteToProject` publishes `demand-intake.demand.promoted` with the payload `{demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget?}`, which is consumed by `project-execution`'s already-implemented, idempotent `ProjectExecutionEventSub` to create a `Project` deduped by `sourceDemandId` (D3-2). (2) It **publishes** three further lifecycle events (`demand-intake.demand.submitted`, `demand-intake.demand.approved`, `demand-intake.demand.rejected`). (3) It carries an **optional soft reference** to `strategy-portfolio` goals — a nullable `goalId` on `ScoringCriterion` for the strategic-fit criterion, used for traceability only, NOT hard-validated and with NO runtime call into strategy-portfolio (D3-1). (4) It depends on **identity-access** (authZ/RBAC, per-gate permissions, record scoping, audit) through the foundation `auth` kernel. `demand-intake` **subscribes to no events** (D3-7); it is a pure publisher plus the identity-access consumer.

## Promote Seam — `demand-intake.demand.promoted` → project-execution (D3-2)

This is the single most important cross-unit contract and it is already half-built: `project-execution` subscribes to it today in `apps/api/src/modules/project-execution/events/project-execution-event.sub.ts`.

### Exact Payload Contract

`PromotionService` publishes a `DomainEvent<DemandPromotedPayload>` whose `data` is **byte-identical** to project-execution's `DemandPromotedPayload` interface:

```typescript
interface DemandPromotedPayload {
  demandId: string;          // DemandRequest.id — traceability key
  name: string;              // defaults from DemandRequest.title
  portfolioId: string;       // supplied by PromoteToProject (NOT on the intake form)
  programId?: string | null; // optional, supplied by PromoteToProject
  plannedStart: string;      // ISO 8601 — supplied by PromoteToProject
  plannedEnd: string;        // ISO 8601 — supplied by PromoteToProject
  plannedBudget?: number | null; // optional, supplied by PromoteToProject
}
```

- **eventType**: `demand-intake.demand.promoted`.
- **Envelope**: foundation `DomainEvent<T>` — `{ eventId, eventType, occurredAt, data }`; `eventId` is the consumer idempotency key.

### Why PromoteToProject supplies portfolioId + dates

The intake form (US-029) captures only `{title, sponsor, description, expectedValue?}` — it has **no portfolio, no schedule, no budget**. Those are project-planning facts the Portfolio Manager decides at promotion time. Therefore `POST /intake/requests/:id/promote` accepts a `PromoteToProject {portfolioId, plannedStart, plannedEnd, plannedBudget?, programId?}` DTO; `name` defaults from the demand's `title`. `PromotionService` merges the demand identity (`demandId`) with these PM-supplied planning params to assemble the exact payload above. This keeps the intake schema free of execution-planning concerns while still producing a complete `Project`.

### Consumer behaviour (already implemented — do not modify)

- Handler: `ProjectExecutionEventSub` (registered `onModuleInit`), wrapped by `makeIdempotent("project-execution.demand-promoted", ledger, …)`.
- On first delivery it calls `projectService.createProject({ name, portfolioId, programId, plannedStart, plannedEnd, plannedBudget, sourceDemandId: demandId }, systemCtx, randomUUID())` under a synthetic `EPMO_DIRECTOR` system context.
- **Idempotency / traceability**: the created `Project` carries `sourceDemandId = demandId`; execution dedupes by it, so re-publishing the same promotion is safe (resiliency-baseline). No `demand-intake` change is required on that side.

### Producer obligations

- `PromotionService.promoteToProject` requires `DemandRequest.status === Approved` (else `DEMAND_*`), publishes the event, sets `status = Promoted` (terminal), writes an audit entry, and best-effort records `promotedProjectId` (NOT required — the Project id is minted on the consumer side, so this is set only if surfaced back; absence never blocks promotion).
- Publish is **safe to retry** — the consumer's `sourceDemandId` dedupe absorbs duplicates.

## Events Published (consumed by others)

All events use the foundation `DomainEvent<T>` envelope and are emitted via `eventBus.publish(...)` (matching the codebase's in-process bus, `foundation/events/event-bus.ts`).

| Event | Emitted by | Payload (`event.data`) | Purpose / likely consumers |
|-------|-----------|------------------------|----------------------------|
| `demand-intake.demand.submitted` | `DemandRequestService.submitIntake` | `{ demandId, title, submittedBy }` | Announce a new intake request (reporting, notifications) |
| `demand-intake.demand.approved` | `StageGateService.advanceGate` (on final approve) | `{ demandId }` | Signal the demand reached the `Approved` (promotable) gate |
| `demand-intake.demand.rejected` | `StageGateService.rejectGate` | `{ demandId, reason }` | Signal terminal rejection with reason |
| `demand-intake.demand.promoted` | `PromotionService.promoteToProject` | `{ demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget? }` | **Exact project-execution contract** — creates the Project (idempotent, `sourceDemandId`) |

## Strategic-Fit Soft Reference → strategy-portfolio (D3-1)

- **What**: `ScoringCriterion.goalId` is a nullable `uuid` that may point at a `strategy-portfolio` `StrategicGoal` when a Director configures a "strategic-fit" scoring criterion.
- **Decoupled**: it is a **soft reference** — NO cross-schema foreign key, NOT hard-validated, and there is **NO runtime call** into strategy-portfolio at configure-time or score-time. It exists purely for traceability/reporting (which goal a criterion is meant to reflect).
- **Consequence**: `demand-intake` never imports strategy-portfolio types and never fails if a `goalId` is stale or absent. Scoring (`ScoreCalculator`) treats the criterion identically regardless of `goalId`.

## In-Process Dependency → identity-access (authZ / RBAC / audit)

- **How**: inject the foundation `auth` kernel; authZ enforced via `AuthGuard` + `@RequirePermission()` decorators on every controller handler (`DemandRequestController`, `ScoringModelController`, `ScoringController`, `StageGateController`, `PromotionController`).
- **Role model** (RBAC):
  - **EPMO Director**: configure scoring models, score requests, view all requests.
  - **Portfolio Manager**: submit intake, score, advance/reject gates, promote; record-scoped to own submissions where applicable.
- **Per-gate permissions on advance** (D3-4): `StageGateService.advanceGate` additionally checks a gate-specific permission from `AuthContext` before each transition, e.g. `intake-gate:screening`, `intake-gate:evaluation`, `intake-gate:approval`. Lacking the gate permission → RFC7807 403, no state mutation.
- **Record scoping**: `AuthContext.recordScopes` filters `GET /intake/requests` to the caller's own `submittedBy`; Director scope returns all.
- **Audit**: `AuditService.record()` is called after every mutating command — submit, configure-scoring, score, advance, reject, promote.
- **Coupling**: read-only; `demand-intake` never writes into identity-access.

## Event Bus Contract

All events use the foundation `DomainEvent<T>` envelope:

```typescript
interface DomainEvent<T> {
  eventId: string;       // UUID — idempotency key for consumers
  eventType: string;     // e.g. 'demand-intake.demand.promoted'
  occurredAt: string;    // ISO 8601
  data: T;               // payload (accessed as event.data)
}
```

Publication goes through the in-process `EventBus` (`foundation/events/event-bus.ts`); delivery is **at-least-once**. `demand-intake` is a publisher only (D3-7) — it registers **no** `EventBus.subscribe(...)` handlers and therefore owns no idempotency ledger. Consumers of `demand-intake` events (notably project-execution) provide their own idempotency via `makeIdempotent`; `demand-intake`'s obligation is that every published event carries a stable `eventId` so those consumers can dedupe.

## Sequence — submit → score → advance(gate) → approve → promote

1. **Submit** (US-029): Portfolio Manager `POST /intake/requests {title, sponsor, description, expectedValue?}`. `DemandRequestService.submitIntake` validates required fields (missing → `DEMAND_001`), persists `DemandRequest` with `status=Submitted`, `currentGate=Submitted`, publishes `demand-intake.demand.submitted {demandId, title, submittedBy}`, writes audit.
2. **Score** (US-030): Director/Portfolio Manager `POST /intake/requests/:id/score {scores:[{criterionId, rawScore}]}`. `ScoringService.scoreRequest` loads the single active `ScoringModel` + criteria, calls the pure `ScoreCalculator.computeWeightedTotal(criteria, scores)` → 0–100, upserts one `ScoreCard` (`@@unique([demandRequestId])`) with `CriterionScore` rows. `GET /intake/requests/ranked` returns the ranked list (desc `weightedTotal`, stable tie-break by `submittedAt`).
3. **Advance a gate** (US-031): Portfolio Manager `POST /intake/requests/:id/advance`. `StageGateService.advanceGate` checks the per-gate permission (`intake-gate:screening` → `…:evaluation` → `…:approval`), applies the forward-only state-machine transition `Submitted → Screening → Evaluation → Approved`, records a `GateDecision {fromGate, toGate, decision=Advanced, decidedBy}`, writes audit. An illegal transition throws `DEMAND_*` and mutates nothing (PBT P3). (A reject at any active gate instead → `status=Rejected` + reason, `GateDecision.decision=Rejected`, publishes `demand-intake.demand.rejected {demandId, reason}`, terminal.)
4. **Final approve** (US-031): the advance that reaches `Approved` also sets `status=Approved` and publishes `demand-intake.demand.approved {demandId}`. The demand is now promotable.
5. **Promote** (US-032): Portfolio Manager `POST /intake/requests/:id/promote {portfolioId, plannedStart, plannedEnd, plannedBudget?, programId?}`. `PromotionService.promoteToProject` asserts `status=Approved`, assembles the exact `DemandPromotedPayload` (demand identity + PM-supplied planning params, `name` from `title`), publishes `demand-intake.demand.promoted`, sets `status=Promoted` (terminal), writes audit.
6. **Downstream** (existing, project-execution): `ProjectExecutionEventSub` receives `demand-intake.demand.promoted`, idempotently creates a `Project` with `sourceDemandId=demandId`. Duplicate deliveries are absorbed by execution's `sourceDemandId` dedupe.

## External Integrations

None. No third-party systems are called; all integration is in-process through the foundation kernel and event bus.
