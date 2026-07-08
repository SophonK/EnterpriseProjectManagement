# Integration — strategy-portfolio

## Summary

`strategy-portfolio` integrates with the rest of the EPM platform through four seams, all mediated by the foundation shared kernel — no direct cross-module database access and no cross-schema foreign keys. (1) It **subscribes** to `project-execution.project.created` and `project-execution.project.status-changed` to maintain the local `ProjectAlignmentView` read-model (D3-1) via `ProjectAlignmentProjector`, with idempotent, retry-safe handling. (2) It **publishes** four domain events (`strategy-portfolio.portfolio.created`, `strategy-portfolio.program.created`, `strategy-portfolio.project.linked-to-goal`, `strategy-portfolio.project.flagged-unaligned`) through the transactional outbox. (3) It **exposes** a small in-process module API (`programExists`, portfolio/program lookups) that `project-execution` uses to validate its soft references. (4) It depends on **identity-access** (authZ/RBAC, record scoping, audit) through the foundation `auth` kernel. The soft-ref anti-corruption seam keeps execution's `projectId`/`portfolioId`/`programId` as plain UUIDs inside the `strategy` schema — the projection is the only place execution project state is mirrored, and it is fed exclusively by events.

## In-Process Dependencies

### → identity-access
- **How**: inject `IAuthService` from the foundation `auth` shared kernel; authZ enforced via `AuthGuard` + `@RequirePermission()` decorators on every controller handler (`StrategicGoalController`, `PortfolioController`, `GoalLinkController`, `AlignmentController`, `InvestmentMixController`).
- **Record scoping**: `AuthContext.recordScopes` filters portfolio/program/investment-mix reads to `Portfolio.ownerId`; EPMO Director scope returns all portfolios and is the only role permitted the `GET /strategy/alignment/unaligned` report.
- **Audit**: `AuditService.record()` is called after every mutating command (create goal, archive goal, create portfolio, associate goals, create program, link/unlink goal).
- **Coupling**: read-only; strategy-portfolio never writes into identity-access.

### → project-execution (module API exposed BY this unit)
- **How**: `StrategyPortfolioModule` exports `IStrategyPortfolioService` (backed by `ProgramService` and `PortfolioService`); `project-execution` injects it to validate its soft references.
- **Used for** (D3-6):
  - `programExists(programId)` — called in `ProjectService.createProject()` / `assertProgramBelongsToPortfolio` when a `programId` is supplied.
  - portfolio/program lookups (`getPortfolio`, `listPrograms(portfolioId)`) — support `assertPortfolioExists` / `assertProgramBelongsToPortfolio` on the execution side.
- **Coupling**: read-only assertion surface; no writes into strategy-portfolio from execution. Validation **degrades gracefully** (resiliency-baseline) — a lookup miss returns a definite negative rather than throwing infrastructure errors.

### ← project-execution (event subscriber INTO this unit)
- **Events**: `project-execution.project.created`, `project-execution.project.status-changed`.
- **Handler**: `ProjectAlignmentProjector` (registered in `strategy-portfolio.events`), subscribed on `onModuleInit` via `EventBus.subscribe(...)`.
- **Payloads** (from the foundation `DomainEvent<T>` envelope, read as `event.data`):
  - `project.created` → `{ projectId, name, status, portfolioId, programId?, plannedBudget? }`
  - `project.status-changed` → `{ projectId, status, portfolioId, programId? }`
- **Effect**: `upsert ProjectAlignmentView` keyed on `projectId` (PK, soft ref), then `AlignmentService.evaluateAlignment(projectId)`.

## Anti-Corruption Seam (soft-ref to execution)

- **No cross-schema FK** (D3-2): `GoalLink.projectId`, `ProjectAlignmentView.projectId`, `ProjectAlignmentView.portfolioId`, and `ProjectAlignmentView.programId` are plain `uuid` soft references into the `execution` schema. The `strategy` schema owns its own integrity constraints only.
- **Single mirror point**: `ProjectAlignmentView` is the *only* representation of execution project state inside `strategy`, and it is populated exclusively by the two subscribed events — never by querying execution's database or REST API (D3-1). All alignment and investment-mix reads hit the projection.
- **Translation**: `ProjectAlignmentView.status` is a `string` that mirrors execution's project status vocabulary (`Open`/`Active`/`Completed`/`Cancelled`); strategy-portfolio does not import execution's status enum, keeping the schemas decoupled.
- **Out-of-order / duplicate tolerance** (resiliency-baseline): the projector upsert is guarded by `lastEventAt` so a stale or replayed event cannot regress the view; duplicate deliveries are absorbed by the idempotency ledger (below).

## Event Bus Contract

All events use the foundation `DomainEvent<T>` envelope:

```typescript
interface DomainEvent<T> {
  eventId: string;       // UUID — idempotency key for consumers
  eventType: string;     // e.g. 'strategy-portfolio.project.flagged-unaligned'
  occurredAt: string;    // ISO 8601
  data: T;               // payload (accessed as event.data)
}
```

Subscriptions are wired through the in-process `EventBus` (`foundation/events/event-bus.ts`). Delivery is **at-least-once**, so every handler is wrapped with `makeIdempotent(handlerName, ledger, handler)` (`foundation/events/idempotency.ts`). The durable `PrismaIdempotencyLedger` claims `(eventId, handler)` against `shared.processed_events`; a duplicate `eventId` is a no-op (property P4). One handler's failure is isolated and logged by the bus, so it cannot block sibling handlers.

### Idempotency Ledger Wiring
- **Token**: `STRATEGY_IDEMPOTENCY_LEDGER` (Symbol), defaulting to `PrismaIdempotencyLedger`; overridable with `InMemoryIdempotencyLedger` in unit/PBT tests.
- **Handler name**: `strategy-portfolio.project-alignment-projector` — the stable identity used as the second half of the ledger key.

## Events Subscribed (consumed by this unit)

| Event | Handler | Effect |
|-------|---------|--------|
| `project-execution.project.created` | `ProjectAlignmentProjector` | `upsert ProjectAlignmentView` (projectId, name, status, portfolioId, programId, plannedBudget, lastEventAt) → `AlignmentService.evaluateAlignment(projectId)` |
| `project-execution.project.status-changed` | `ProjectAlignmentProjector` | `upsert ProjectAlignmentView.status` (guarded by `lastEventAt`) → on transition to `Active`, `AlignmentService.evaluateAlignment(projectId)` |

## Events Published (consumed by others, via outbox)

Publication uses the transactional outbox (`foundation/events/outbox.ts`): each event is written with `OutboxWriter.enqueue(tx, event)` **inside the same Prisma transaction** as the state change (REL-4), so persistence is atomic; the post-commit `OutboxRelay` delivers it to the bus. Redelivery after a crash is safe because consumers are idempotent.

| Event | Emitted by | Purpose / likely consumers |
|-------|-----------|----------------------------|
| `strategy-portfolio.portfolio.created` | `PortfolioService.createPortfolio` | Announce new portfolio (reporting, downstream registrations) |
| `strategy-portfolio.program.created` | `ProgramService.createProgram` | Announce new program under a portfolio |
| `strategy-portfolio.project.linked-to-goal` | `GoalLinkService.linkProjectToGoals` | Signal alignment established for a project (reporting) |
| `strategy-portfolio.project.flagged-unaligned` | `AlignmentService.evaluateAlignment` | Surface an active project with no linked goal (US-010 report, reporting) |

## Alignment Flow — Sequence

Projection-and-evaluation path triggered when a project is created or activated:

1. `project-execution` commits a project create/activate and enqueues `project-execution.project.created` (or `.status-changed`) to its outbox; the relay publishes it after commit.
2. The in-process `EventBus` dispatches to `ProjectAlignmentProjector`, wrapped by `makeIdempotent("strategy-portfolio.project-alignment-projector", ledger, …)`. The ledger claims `(eventId, handler)` against `shared.processed_events`; a duplicate delivery returns `false` and the handler exits (no-op).
3. First-time delivery: `ProjectAlignmentViewRepository.upsert(projectId, { name, status, portfolioId, programId, plannedBudget, lastEventAt })`. The upsert is guarded by `lastEventAt` so an out-of-order/older event does not overwrite newer state (upsert keyed on `projectId`).
4. The projector calls `AlignmentService.evaluateAlignment(projectId)`.
5. `evaluateAlignment` reads `GoalLinkRepository` for `projectId`: `aligned = (GoalLink count ≥ 1)` (P2 — total, deterministic function). It writes `ProjectAlignmentView.aligned`.
6. **Flag-unaligned branch** (D3-4): if `view.status === 'Active'` AND `aligned === false`, the service enqueues `strategy-portfolio.project.flagged-unaligned` via `OutboxWriter.enqueue(tx, event)` in the same transaction as the `aligned=false` write. The relay delivers it post-commit.
7. Independently, when a Portfolio Manager links a project to goals (`POST /strategy/goal-links`), `GoalLinkService.linkProjectToGoals` performs the idempotent upsert (P3), publishes `strategy-portfolio.project.linked-to-goal`, and re-runs `AlignmentService.evaluateAlignment(projectId)`, flipping `ProjectAlignmentView.aligned` to `true`.
8. `GET /strategy/alignment/unaligned` (Director only) reads the projection: `status = 'Active' AND aligned = false`, joined to portfolio for `portfolioName`/`ownerId`; empty result → `fullyAligned: true`.

## External Integrations

None. No third-party systems are called; all integration is in-process through the foundation kernel and event bus.
