# NFR Design — strategy-portfolio

## Summary

NFR design patterns and logical components for `strategy-portfolio`, showing exactly how the security-baseline and resiliency-baseline controls are realized on top of **foundation primitives** (no new tech). Security patterns cover the request lifecycle, RBAC placement, and repository-level record scoping. Resiliency patterns cover retries/timeouts/idempotency for the `ProjectAlignmentProjector`, out-of-order/duplicate tolerance via `lastEventAt`-guarded upsert on `ProjectAlignmentView`, graceful degradation of module-API soft-ref validation, and the transactional outbox for reliable publish. All names are byte-identical to the canonical model.

## Security Patterns

### Request Lifecycle (security view)
```
HTTP Request  →  /strategy/*
  → AuthGuard (global): JWT verified by TokenVerifier (JWKS, issuer-pinned, fail-closed)
                        + @RequirePermission checked against RbacRegistry (deny-by-default)
  → ZodValidationPipe (controller): strict DTO parse; unknown/invalid → 400 STRATEGY_001
  → Controller  → Service (domain rules)
  → Repository  → applies owner-scope filter when caller is not EPMO Director
  → AuditInterceptor (post-response): AuditService.record() for every mutation
  → ProblemDetailsFilter (on throw): RFC 7807 application/problem+json
```
The single global `AuthGuard` does both authN and authZ; there is no unit-local auth code. A protected route that forgets `@RequirePermission` is **refused** (fail-closed), so no `/strategy` route can be accidentally open.

### RBAC Grants (registered at module bootstrap)
```
RbacRegistry.grant(EPMO_DIRECTOR,
  'strategy:goal:create', 'strategy:goal:archive', 'strategy:goal:read',
  'strategy:alignment:read');
RbacRegistry.grant(PORTFOLIO_MANAGER,
  'strategy:goal:read',
  'strategy:portfolio:create', 'strategy:portfolio:read',
  'strategy:portfolio:associate-goals',
  'strategy:program:create', 'strategy:program:read',
  'strategy:goal-link:create', 'strategy:goal-link:delete',
  'strategy:investment-mix:read');
```
Handler decoration (representative):
- `POST /strategy/goals` → `@RequirePermission('strategy:goal:create')` (Director only)
- `GET  /strategy/alignment/unaligned` → `@RequirePermission('strategy:alignment:read')` (Director only)
- `POST /strategy/portfolios` → `@RequirePermission('strategy:portfolio:create')` (Portfolio Manager)
- `POST /strategy/goal-links` → `@RequirePermission('strategy:goal-link:create')` (Portfolio Manager)
- `GET  /strategy/investment-mix` → `@RequirePermission('strategy:investment-mix:read')` (Portfolio Manager)

### Record-Scope Enforcement (in the repository, not the controller)
Scope is applied where the query is built so no read path can bypass it.
```typescript
// PortfolioRepository.findManyScoped(ctx)
const scopeFilter = ctx.roles.includes('EPMO_DIRECTOR')
  ? {}                                   // Director: view all portfolios
  : { ownerId: ctx.userId };            // Portfolio Manager: own portfolios only

return prisma.portfolio.findMany({
  where: { ...scopeFilter, status: 'Active' },
});
```
- `getPortfolio(id, ctx)` re-checks ownership after fetch → `404`/`403` if a non-Director requests a portfolio they do not own (no existence leak).
- `ProgramRepository` scopes via the parent `Portfolio.ownerId`; `InvestmentMixService` restricts its aggregation input to the caller's owned portfolios (Director: unrestricted).
- `ProjectAlignmentView` is a derived read model; unaligned and investment-mix reads inherit the same owner-scope constraint through the joined `Portfolio`.

### Input Validation & Audit
- Every DTO (DefineStrategicGoal, CreatePortfolio, associateGoals `{goalIds[]}`, CreateProgram, LinkProjectToGoal `{projectId, goalIds[]}`, `groupBy` query) is a strict Zod schema run by `ZodValidationPipe`.
- `AuditInterceptor` records actor, action, and entity for all mutations; `AuthGuard.recordDenied` audits `403`s best-effort (never escalates to `500`).

## Resiliency Patterns

### ProjectAlignmentProjector — idempotent, retry-safe, order-tolerant
The projector subscribes to `project-execution.project.created` and `project-execution.status.changed`. Three layers protect it:

**1. Idempotency (duplicate delivery).** The handler is wrapped with foundation `makeIdempotent`:
```typescript
bus.subscribe('project-execution.project.created',
  makeIdempotent('ProjectAlignmentProjector', ledger, (e) => projector.onProjectEvent(e)));
bus.subscribe('project-execution.status.changed',
  makeIdempotent('ProjectAlignmentProjector', ledger, (e) => projector.onProjectEvent(e)));
```
`PrismaIdempotencyLedger.markIfNew(eventId, 'ProjectAlignmentProjector')` claims `(eventId, handler)` in `shared.processed_events`; a `P2002` means already-processed → skip. This gives at-most-once execution under the bus's at-least-once delivery.

**2. Out-of-order / duplicate tolerance (`lastEventAt`-guarded upsert on `projectId`).**
```typescript
// ProjectAlignmentViewRepository.upsertFromEvent(projectId, patch, occurredAt)
const current = await tx.projectAlignmentView.findUnique({ where: { projectId } });
if (current && current.lastEventAt >= occurredAt) return; // stale/reordered/duplicate → no-op
await tx.projectAlignmentView.upsert({
  where:  { projectId },
  create: { projectId, ...patch, lastEventAt: occurredAt },
  update: { ...patch, lastEventAt: occurredAt },
});
```
The upsert key is `projectId` (the view's PK), so first-time and repeat events converge to the same row, and the `lastEventAt` guard ensures a late or reordered event never overwrites newer state. After the upsert the projector calls `AlignmentService.evaluateAlignment(projectId)` to (re)materialize `aligned`; if the project is active and unaligned it publishes `strategy-portfolio.project.flagged-unaligned` (via the outbox).

**3. Retry & timeout.** Delivery is retried by the in-process bus/outbox relay; because layers 1–2 make re-execution safe, a transient failure simply retries on the next relay tick. The projector wraps its DB work in a Prisma transaction with the platform statement timeout; a failure is logged at `error` and left unmarked in the ledger so it is retried (not silently dropped).

### Reliable Publish — transactional outbox
Every outbound event is written inside the same transaction as the state change, so state and event commit atomically:
```typescript
await prisma.$transaction(async (tx) => {
  const portfolio = await portfolioRepo.create(tx, dto, ctx.userId);   // ownerId = caller
  await outbox.enqueue(tx, domainEvent('strategy-portfolio.portfolio.created', portfolio));
});
// OutboxRelay delivers post-commit; idempotent consumers make redelivery safe.
```
Applies to `strategy-portfolio.portfolio.created`, `.program.created`, `.project.linked-to-goal`, and `.project.flagged-unaligned`. A crash between commit and delivery leaves the event durable in `outbox_event`; `OutboxRelay.relayOnce()` redelivers in `occurredAt` order and stops on the first failing row to preserve ordering.

### Graceful Degradation — module-API soft-ref validation
Execution validates its Project→Program soft ref (D3-6) by calling `ProgramService.programExists(programId)`. This is fail-open:
```typescript
async programExists(programId: string): Promise<boolean> {
  try {
    return (await programRepo.count({ id: programId, status: 'Active' })) > 0;
  } catch (err) {
    this.logger.warn({ err, programId }, 'programExists check degraded — failing open');
    return true; // do not hard-block execution; projection reconciles later
  }
}
```
A transient strategy-side failure yields a logged `warn` and a permissive result rather than blocking an execution write; eventual consistency is restored when the corresponding project event is projected.

### DB Exception Mapping
Prisma errors are caught by the global `ProblemDetailsFilter` (foundation):
- `P2002` (unique violation, e.g. duplicate `PortfolioGoal`/`GoalLink`) → `409 Conflict` — but link/associate paths treat this as idempotent success (P3), not an error.
- `P2025` (record not found) → `404`.
- Others → `500 INTERNAL` (internals not leaked).

## Performance Design

### Index Strategy (from canonical model, `strategy` schema)
```
ProjectAlignmentView : @@index([status])       -- unaligned filter (status='Active') + mix scan
ProjectAlignmentView : @@index([portfolioId])  -- portfolio grouping / owner scope join
GoalLink             : @@index([projectId])    -- alignment recompute + goal grouping join
GoalLink             : @@unique([goalId, projectId])   -- link idempotency (P3)
Program              : @@index([portfolioId])  -- scoped program list + portfolio roll-up
PortfolioGoal        : @@unique([portfolioId, goalId]) -- association idempotency (P3)
```

### Materialized `aligned` flag
`aligned` is computed by the projector on write (not per read), so `GET /strategy/alignment/unaligned` is a single indexed filter (`status='Active' AND aligned=false`) and never recounts GoalLinks at request time — the key to p95 < 300 ms.

### On-demand investment mix (D3-5)
No materialized store; the grouped `COUNT` + `SUM(plannedBudget)` runs at query time over the indexed projection ⨝ `GoalLink`/`Portfolio`. A project linked to N goals contributes to N goal-groups by design (per-link expansion, documented in P1). At portfolio scale this stays index-driven within the 300 ms budget.

## Logical Components (NFR view)

| Component | NFR role |
|-----------|----------|
| `AuthGuard` (foundation) | AuthN (JWT) + AuthZ (RBAC), deny-by-default — SEC-SP-01/02 |
| `RbacRegistry` (foundation) | Role→permission grants for the unit — SEC-SP-02 |
| `ZodValidationPipe` (foundation) | Strict input validation — SEC-SP-05 |
| `PortfolioRepository` / `ProgramRepository` / `InvestmentMixService` | Owner record-scope enforcement — SEC-SP-03 |
| `AuditInterceptor` + `AuditService` (foundation) | Mutation audit trail — SEC-SP-04 |
| `ProjectAlignmentProjector` + `makeIdempotent` / `PrismaIdempotencyLedger` (foundation) | Idempotent, retry-safe projection — REL-SP-01 |
| `ProjectAlignmentViewRepository` (`lastEventAt`-guarded upsert) | Out-of-order/duplicate tolerance — REL-SP-02 |
| `OutboxWriter` / `OutboxRelay` (foundation) | Reliable transactional publish — REL-SP-03 |
| `ProgramService.programExists` | Graceful soft-ref degradation — REL-SP-04 |
| `ProblemDetailsFilter` (foundation) | RFC 7807 DB/error mapping — REL-SP-05 |

## Logging
```typescript
this.logger.info({ portfolioId, userId: ctx.userId, action: 'createPortfolio' }, 'portfolio created');
this.logger.info({ projectId, eventId, action: 'projectAlignmentUpsert' }, 'projection updated');
this.logger.warn({ projectId }, 'active project flagged unaligned');
this.logger.warn({ programId }, 'programExists check degraded — failing open');
this.logger.error({ err, eventId }, 'projection failed; will retry');
```
