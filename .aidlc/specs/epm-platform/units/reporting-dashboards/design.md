# reporting-dashboards — D4 Design

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data access pattern | In-process service calls + direct Prisma cross-schema reads | `reporting` schema is the only reader permitted to query across schemas (BaseRepository rule); delegating to existing services reuses tested business logic |
| Materialized views | None in MVP — pure on-demand aggregation | Simplicity; data volumes are governance-report scale (hundreds of projects), not millions of rows |
| Export format | CSV only (US-015 says "PDF/CSV"); PDF deferred to Phase 2 | CSV is zero-dependency; PDF requires rendering library (Phase 2 scope) |
| Export row limit | 1000 rows max; above → REPORT_002 with suggestion to narrow filter | Keeps response time bounded; avoids OOM on large exports |
| Alignment coverage source | Direct Prisma query on `strategy.ProjectAlignmentView` | Not exported by StrategyPortfolioModule; reporting is the only cross-schema reader |
| Portfolio health feed | `ProjectQueryService.getPortfolioRollup()` + `getAtRiskProjects()` + direct Prisma for alignment + `RaidItemService.listRaidItems(escalated=true)` | Reuses tested services; minimises duplicated query logic |
| Capacity heatmap feed | `UtilizationService.getUtilization()` | Fully reuses resource-management unit |
| Risk summary feed | `RaidItemService.listRaidItems()` | Fully reuses risk-raid unit |
| PBT coverage | P1 CSV row-count, P2 CSV deterministic, P3 toCsv column-count | Tests the reporting-specific serialization layer |

## Unit Overview

- **DB schema**: `reporting` — no tables in MVP (schema created, reserved for Phase 2 materialized snapshots)
- **Module**: `ReportingDashboardsModule` — 2 controllers, 2 services, no repositories
- **Imports**: DbModule + AuthModule + ProjectExecutionModule + ResourceManagementModule + RiskRaidModule
- **No events** subscribed or published in MVP (stateless on-demand; event-driven refresh is Phase 2)
