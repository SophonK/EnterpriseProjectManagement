# risk-raid — NFR Design

## Performance Design
- **Indexes**: `raid_item(project_id)`, `raid_item(escalated) WHERE escalated=TRUE`, `raid_item(status)`, `dependency(from_project_id)`, `dependency(to_project_id)`.
- **Pagination**: default `pageSize=25`, max 100; `findMany` always takes `skip`/`take`.
- **Escalation**: computed synchronously in `createRaidItem`/`updateRaidItem` — single extra `UPDATE` + `eventBus.publish`; no extra round-trips on non-Risk types.

## Security Design
- `buildScopeWhere(ctx)`: `EPMO_DIRECTOR` → `{}` (no filter); `PORTFOLIO_MANAGER` → `{ projectId: { in: portfolioProjectIds } }` (from `ctx.recordScopes`); `PROJECT_MANAGER` → `{ projectId: { in: projectIds } }` (from `ctx.recordScopes`); other roles → same as PROJECT_MANAGER or empty result if no scopes.
- `findByIdOrThrow` applies scope filter → returns 404 (`RISK_004`) for both missing and out-of-scope items (avoids enumeration).

## Idempotency Design
- `RiskRaidEventSub` wraps both handlers with `makeIdempotent(event.eventId, RISK_RAID_IDEMPOTENCY_LEDGER)`.
- `RISK_RAID_IDEMPOTENCY_LEDGER` is an optional injection token (same pattern as project-execution).

## Observability Design
- Escalation: `logger.warn({ raidItemId, riskScore, threshold }, 'risk escalated')`.
- Project archived: `logger.info({ projectId, closedCount }, 'raid items closed on project archived')`.
