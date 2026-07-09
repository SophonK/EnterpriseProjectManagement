# reporting-dashboards — Integration Design

## In-Process APIs Consumed

| API | Provider Module | Method | Used for |
|-----|-----------------|--------|---------|
| `ProjectQueryService.getPortfolioRollup(portfolioId, null, ctx)` | ProjectExecutionModule | read | Rollup counts for portfolio health |
| `ProjectQueryService.getAtRiskProjects(portfolioId, ctx)` | ProjectExecutionModule | read | At-risk projects drill-down |
| `UtilizationService.getUtilization(filter, ctx)` | ResourceManagementModule | read | Capacity heatmap dashboard |
| `RaidItemService.listRaidItems(filter, ctx)` | RiskRaidModule | read | Risk summary + top escalated risks |
| `PrismaService.projectAlignmentView` (cross-schema read) | DbModule | read | Alignment coverage for portfolio health |

## Events

**Publishes**: None in MVP  
**Subscribes**: None in MVP

Rationale: reporting-dashboards is purely on-demand; event-driven incremental snapshot refresh is Phase 2.

## Cross-Unit Boundary Rules

1. reporting-dashboards **may read** from any unit's DB schema via `PrismaService` (the only cross-schema reader by architecture rule).
2. reporting-dashboards **never writes** to any schema.
3. All RBAC/scope filtering is delegated to the source service or enforced by `buildScopeWhere` patterns already in place.
4. No FK constraints from `reporting` to any other schema (no tables in MVP).
