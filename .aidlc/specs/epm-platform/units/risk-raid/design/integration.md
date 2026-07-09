# risk-raid — Integration Design

## Events Published

| Event | Type constant | Trigger | Payload |
|-------|--------------|---------|---------|
| RAID logged | `risk-raid.raid.logged` | RaidItem created | `{ raidItemId, projectId, type, title, riskScore, escalated }` |
| Risk escalated | `risk-raid.risk.escalated` | riskScore ≥ threshold on create/update | `{ raidItemId, projectId, riskScore, threshold, ownerUserId }` |
| Dependency linked | `risk-raid.dependency.linked` | Dependency created | `{ dependencyId, fromProjectId, toProjectId, dependencyType }` |

## Events Subscribed

| Event | Source | Handler |
|-------|--------|---------|
| `project-execution.project.created` | project-execution | No-op; log + return (idempotent) |
| `project-execution.project.archived` | project-execution | `closeAllForProject(projectId)` — sets Open/InProgress items to Closed |

Both handlers wrapped with `makeIdempotent(eventId, ledger)`.

## In-Process APIs Consumed

| API | Provider | Used for |
|-----|----------|---------|
| `ProjectService.getProject(id, ctx)` | project-execution | Soft-FK validation of `projectId`, `fromProjectId`, `toProjectId` |

Injected via `{ provide: "PROJECT_SERVICE", useExisting: ProjectService }` — same pattern as resource-management; avoids circular dep.

## In-Process APIs Exposed

```typescript
// Consumed by reporting-dashboards read side:
interface RaidQueryService {
  listEscalatedRisks(ctx: AuthContext): Promise<RaidItemDTO[]>;
  getRaidSummary(projectIds: string[], ctx: AuthContext): Promise<RaidSummaryDTO>;
}
```

Exported from `RiskRaidModule.exports`.

## Cross-Unit Boundary Rules

1. risk-raid **never reads from** `execution.*` schema directly — all project validation goes through `ProjectService` in-process API.
2. risk-raid **never writes to** any schema outside `risk.*`.
3. reporting-dashboards reads from `risk.*` schema for dashboard queries (read-only, separate connection).
4. `projectId` fields in `risk.raid_item` and `risk.dependency` are strings (no DB FK) — soft references enforced at service layer.
