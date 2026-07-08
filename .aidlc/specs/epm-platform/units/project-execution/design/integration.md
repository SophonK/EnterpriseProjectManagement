# Integration — project-execution

## In-Process Dependencies

### → identity-access
- **How**: inject `IAuthService` from foundation shared kernel; authZ checked via `AuthGuard` + `@RequirePermission()` decorators on every controller handler.
- **Record scoping**: `AuthContext.recordScopes` filters project lists; EPMO Director scope returns all.
- **Audit**: `AuditService.record()` called after every mutating command.

### → strategy-portfolio
- **How**: inject `IStrategyPortfolioService` (exported by `StrategyPortfolioModule`).
- **Used for**:
  - `assertPortfolioExists(portfolioId)` — called in `ProjectService.createProject()` before persisting.
  - `assertProgramBelongsToPortfolio(programId, portfolioId)` — called when `programId` is provided.
- **Coupling**: read-only assertion; no writes into strategy-portfolio from this module.

### ← demand-intake (event subscriber)
- **Event**: `demand-intake.demand.promoted`
- **Payload**: `{ demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget? }`
- **Handler**: `ProjectExecutionEventSub.onDemandPromoted()` — calls `ProjectService.createProject()` with `source: 'demand'` flag; idempotency key = `demandId`.
- **Idempotency**: checked against `execution.project` where `source_demand_id = demandId`; duplicate silently no-ops.

## Events Published (consumed by others)

| Event | Consumed by | Purpose |
|-------|-------------|---------|
| `project-execution.project.created` | strategy-portfolio, risk-raid, resource-management, reporting | Trigger downstream registrations |
| `project-execution.project.status-changed` | reporting-dashboards | Refresh portfolio health dashboard |
| `project-execution.rollup.recomputed` | reporting-dashboards | Update cached roll-up in reporting |
| `project-execution.milestone.overdue` | reporting-dashboards | Highlight overdue in portfolio view |

## Event Bus Contract

All events use the foundation `DomainEvent<T>` envelope:
```typescript
interface DomainEvent<T> {
  eventId: string;       // UUID — idempotency key for consumers
  eventType: string;     // e.g. 'project-execution.project.created'
  occurredAt: string;    // ISO 8601
  payload: T;
}
```

Events are dispatched via the foundation in-process `EventBus.publish()` within the same transaction (transactional outbox pattern if resiliency extension demands it; in-process for MVP).

## External Integrations

None in MVP. Jira/Azure DevOps sync is deferred to Phase 2.
