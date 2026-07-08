# NFR Design — demand-intake

## Summary

NFR design patterns and logical components for `demand-intake`, showing exactly how the security-baseline and resiliency-baseline controls are realized on top of **foundation primitives** (no new tech). Security patterns cover the request lifecycle, per-endpoint and per-gate RBAC placement, and repository-level record scoping. Resiliency patterns cover guarded/atomic stage-gate transitions (fail-closed on illegal transition), retry-safe promote publish (consumer dedupes via `sourceDemandId`), and deterministic scoring computation. All names are byte-identical to the canonical model.

## Security Patterns

### Request Lifecycle (security view)
```
HTTP Request  →  /intake/*
  → AuthGuard (global): JWT verified by TokenVerifier (JWKS, issuer-pinned, fail-closed)
                        + @RequirePermission checked against RbacRegistry (deny-by-default)
  → ZodValidationPipe (controller): strict DTO parse; unknown/invalid → 400 DEMAND_001
  → Controller  → Service (domain rules; advance runs a SECOND per-gate RBAC check)
  → Repository  → applies submittedBy record-scope filter when caller is not EPMO Director
  → AuditService.record() inside the state-change transaction (submit/score/advance/reject/promote)
  → ProblemDetailsFilter (on throw): RFC 7807 application/problem+json
```
The single global `AuthGuard` does both authN and authZ; there is no unit-local auth code. A protected route that forgets `@RequirePermission` is **refused** (fail-closed), so no `/intake` route can be accidentally open.

### RBAC Grants (registered at module bootstrap)
```
RbacRegistry.grant(EPMO_DIRECTOR,
  'intake:scoring-model:configure', 'intake:scoring-model:read',
  'intake:request:score', 'intake:request:read');
RbacRegistry.grant(PORTFOLIO_MANAGER,
  'intake:request:submit', 'intake:request:read',
  'intake:request:score',
  'intake:request:advance', 'intake:request:reject', 'intake:request:promote',
  'intake-gate:screening', 'intake-gate:evaluation', 'intake-gate:approval');
```
Handler decoration (representative):
- `POST /intake/requests`             → `@RequirePermission('intake:request:submit')` (Portfolio Manager)
- `GET  /intake/requests` / `:id` / `ranked` → `@RequirePermission('intake:request:read')`
- `POST /intake/scoring-models`       → `@RequirePermission('intake:scoring-model:configure')` (Director)
- `GET  /intake/scoring-models/active`→ `@RequirePermission('intake:scoring-model:read')`
- `POST /intake/requests/:id/score`   → `@RequirePermission('intake:request:score')` (Director / Portfolio Manager)
- `POST /intake/requests/:id/advance` → `@RequirePermission('intake:request:advance')` + per-gate check (below)
- `POST /intake/requests/:id/reject`  → `@RequirePermission('intake:request:reject')`
- `POST /intake/requests/:id/promote` → `@RequirePermission('intake:request:promote')`

### Per-Gate Authorization on Advance (defense-in-depth, fail-closed)
The guard grants entry to the advance endpoint; the *specific gate* being crossed is authorized again inside `StageGateService`, keyed by the target gate, so the coarse `advance` permission alone cannot cross a gate the caller is not entitled to.
```typescript
// StageGateService.advanceGate(id, ctx)
const GATE_PERMISSION: Record<IntakeGate, Permission> = {
  Screening:  'intake-gate:screening',   // Submitted  → Screening
  Evaluation: 'intake-gate:evaluation',  // Screening  → Evaluation
  Approved:   'intake-gate:approval',     // Evaluation → Approved
  Submitted:  /* no inbound advance */    'intake:request:advance',
};
const next = this.nextGate(request.currentGate);            // state machine (see resiliency)
if (!this.rbac.permitted(ctx.roles, GATE_PERMISSION[next])) {
  this.logger.warn({ demandId: id, targetGate: next, userId: ctx.userId }, 'per-gate authz denied');
  throw AppError.forbidden();                                // 403; no state mutation
}
```
The per-gate check uses the same `RbacRegistry.permitted` the guard uses, so grants stay in one catalog.

### Record-Scope Enforcement (in the repository, not the controller)
Scope is applied where the query is built so no read path (list, get, or ranked) can bypass it.
```typescript
// DemandRequestRepository.findManyScoped(ctx)
const scopeFilter = ctx.roles.includes('EPMO_DIRECTOR')
  ? {}                                   // Director: view all requests
  : { submittedBy: ctx.userId };        // Portfolio Manager: own submissions only

return prisma.demandRequest.findMany({ where: { ...scopeFilter /*, status filters */ } });
```
- `getRequest(id, ctx)` re-checks ownership after fetch → `404`/`403` if a non-Director requests one they do not own (no existence leak).
- The ranked read (`listRanked`) is built on the same scoped query, so a Portfolio Manager's ranking never includes another manager's requests.

### Input Validation & Audit
- Every DTO (SubmitIntake `{title, sponsor, description, expectedValue?}`, ConfigureScoring `{name, criteria[]}`, ScoreAndRank `{scores[]}`, AdvanceGate `{}`, reject `{reason}`, PromoteToProject `{portfolioId, plannedStart, plannedEnd, plannedBudget?, programId?}`) is a strict Zod schema run by `ZodValidationPipe`; invalid → `400` `DEMAND_001`.
- Each mutating service calls `AuditService.record({ actorId, action, entityType, entityId, requestId }, tx)` **inside** its Prisma transaction, so the audit row and the state change commit atomically. `AuthGuard.recordDenied` audits `403`s best-effort (never escalates to `500`).

## Resiliency Patterns

### StageGateService — guarded, atomic, fail-closed transitions
The service is an explicit state machine over the FIXED sequence `Submitted → Screening → Evaluation → Approved` (D3-4); `Rejected` and `Promoted` are terminal (D3-5).
```typescript
private nextGate(current: IntakeGate): IntakeGate {
  switch (current) {
    case 'Submitted':  return 'Screening';
    case 'Screening':  return 'Evaluation';
    case 'Evaluation': return 'Approved';
    default:
      throw new AppError('DEMAND_00X', `illegal advance from ${current}`); // Approved/terminal → refuse
  }
}
```
**Atomicity.** The `GateDecision` record and the `DemandRequest.status`/`currentGate` change are written in one transaction, so a partial gate move is impossible:
```typescript
await prisma.$transaction(async (tx) => {
  const req = await demandRepo.getForUpdate(tx, id);           // terminal/illegal → throw before any write
  const next = this.nextGate(req.currentGate);
  // per-gate authz already checked above
  await gateDecisionRepo.create(tx, { demandRequestId: id, fromGate: req.currentGate,
                                      toGate: next, decision: 'Advanced', decidedBy: ctx.userId });
  await demandRepo.setGate(tx, id, next,
                           next === 'Approved' ? 'Approved' : mapGateToStatus(next));
  await audit.record({ actorId: ctx.userId, action: 'update', entityType: 'DemandRequest',
                       entityId: id, requestId }, tx);
  if (next === 'Approved') await eventBus.publish(demandApproved(id));  // final gate
});
```
**Fail-closed.** Any illegal transition (skip, backward, or from `Rejected`/`Promoted`) throws `DEMAND_*` **before** the first write, so state is never mutated on an invalid advance (PBT P3). `rejectGate` follows the same pattern: it records a `GateDecision {decision: 'Rejected', reason}`, sets `status = Rejected` (terminal), and publishes `demand-intake.demand.rejected` — all in one transaction; a reject is legal only from an active gate.

### PromotionService — retry-safe publish (consumer dedupes via sourceDemandId)
Promotion is event-driven (D3-2): intake does not write to execution. Retry safety comes from **consumer-side idempotency**, not an outbox — matching the canonical inheritance (EventBus + idempotency, no outbox in this unit).
```typescript
async promoteToProject(id, params, ctx) {
  await prisma.$transaction(async (tx) => {
    const req = await demandRepo.getForUpdate(tx, id);
    if (req.status !== 'Approved') throw new AppError('DEMAND_00X', 'promote requires Approved'); // incl. Promoted → refuse
    await demandRepo.setStatus(tx, id, 'Promoted');            // Promoted is terminal
    await audit.record({ actorId: ctx.userId, action: 'update', entityType: 'DemandRequest',
                         entityId: id, requestId }, tx);
  });
  await eventBus.publish(demandPromoted({                       // EXACT execution contract
    demandId: id, name: params.name ?? req.title, portfolioId: params.portfolioId,
    programId: params.programId, plannedStart: params.plannedStart,
    plannedEnd: params.plannedEnd, plannedBudget: params.plannedBudget }));
}
```
- **Idempotent consumer.** project-execution creates the `Project` keyed on `sourceDemandId = demandId`; a redelivered or re-published `demand-intake.demand.promoted` (the bus is at-least-once) resolves to the same project — never a duplicate. `demandId` is stable, so the payload is deterministic across retries.
- **Idempotent producer guard.** Because `Promoted` is terminal, a second `promote` on the same request fails the `status === 'Approved'` check fail-closed, so intake will not re-publish either. The publish sits *after* commit; if publish is retried the consumer dedupe absorbs it.

### ScoreCalculator — deterministic, pure computation
`computeWeightedTotal` and `rank` are pure functions (no I/O, no clock, no randomness), so the same inputs always produce the same outputs — the basis for retry-safety and PBT P1/P2.
```typescript
// computeWeightedTotal(criteria[], scores[]) → number in [0,100]
const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
if (totalWeight === 0) return 0;                               // guarded: never NaN (P1)
const weighted = criteria.reduce((s, c) => {
  const raw = scores.get(c.id) ?? 0;
  return s + c.weight * (raw / c.maxScore);                    // normalized 0..1 per criterion
}, 0);
return (weighted / totalWeight) * 100;                          // ∈ [0,100]

// rank(requests[]) → ordered: descending weightedTotal, stable tie-break by submittedAt asc (P2)
return [...requests].sort((a, b) =>
  b.weightedTotal - a.weightedTotal || (a.submittedAt.getTime() - b.submittedAt.getTime()));
```
`weightedTotal` is computed once at score time and persisted on `ScoreCard`, so ranked reads never recompute — deterministic *and* index-friendly (PERF-DI-01).

### DB Exception Mapping
Prisma errors are caught by the global `ProblemDetailsFilter` (foundation):
- `P2002` (unique violation — duplicate `ScoreCard` per request `@@unique([demandRequestId])`, or duplicate `CriterionScore` `@@unique([scoreCardId, criterionId])`) → `409 Conflict`.
- `P2025` (record not found) → `404`.
- Others → `500 INTERNAL` (internals not leaked). All RFC 7807.

## Performance Design

### Index Strategy (from canonical model, `intake` schema)
```
DemandRequest   : @@index([status])                      -- scoped list + ranked-set filter
ScoreCard       : @@unique([demandRequestId])            -- 1:1 join for ranked read; one card per request
ScoringModel    : @@index([isActive])                    -- active-model lookup
ScoringCriterion: @@index([scoringModelId])              -- load criteria for a model version
CriterionScore  : @@unique([scoreCardId, criterionId])   -- one raw score per criterion (no dup)
GateDecision    : @@index([demandRequestId])             -- decision history per request
```

### Precomputed `weightedTotal`
`weightedTotal` is materialized on `ScoreCard` at score time (not per read), so `GET /intake/requests/ranked` is an indexed `DemandRequest` (by `@@index([status])`) ⨝ `ScoreCard` (by `@@unique([demandRequestId])`) pass followed by a deterministic in-memory `ScoreCalculator.rank` over the scoped set — the key to p95 < 300 ms at portfolio scale.

## Logical Components (NFR view)

| Component | NFR role |
|-----------|----------|
| `AuthGuard` (foundation) | AuthN (JWT) + AuthZ (RBAC), deny-by-default — SEC-DI-01/02 |
| `RbacRegistry` (foundation) | Role→permission grants incl. per-gate permissions — SEC-DI-02/03 |
| `StageGateService` (per-gate `RbacRegistry.permitted` check) | Per-gate authorization on advance — SEC-DI-03 |
| `ZodValidationPipe` (foundation) | Strict input validation, fail-closed — SEC-DI-06 / REL-DI-05 |
| `DemandRequestRepository.findManyScoped` | `submittedBy` record-scope enforcement — SEC-DI-04 |
| `AuditService` (foundation, transaction-aware) | Mutation audit trail (submit/score/advance/reject/promote) — SEC-DI-05 |
| `StageGateService` (transactional state machine) | Guarded, atomic, fail-closed gate transitions — REL-DI-03 |
| `PromotionService` + `EventBus` (foundation) | Retry-safe promote publish; consumer dedupes via `sourceDemandId` — REL-DI-01/02 |
| `ScoreCalculator` (pure domain helper) | Deterministic scoring + stable ranking — REL-DI-04 |
| `ProblemDetailsFilter` (foundation) | RFC 7807 DB/error mapping — REL-DI-06 |

## Logging
```typescript
this.logger.info({ demandId, userId: ctx.userId, action: 'submitIntake' }, 'demand submitted');
this.logger.info({ demandId, scoringModelId, action: 'scoreRequest' }, 'demand scored');
this.logger.info({ demandId, fromGate, toGate, action: 'advanceGate' }, 'gate advanced');
this.logger.warn({ demandId, targetGate }, 'per-gate authz denied');
this.logger.info({ demandId, action: 'promoteToProject' }, 'demand promoted; event published');
this.logger.error({ err, demandId }, 'demand-intake DB operation failed');
```
