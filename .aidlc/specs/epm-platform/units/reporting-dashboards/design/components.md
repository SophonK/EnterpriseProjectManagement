# reporting-dashboards — Component Design

## Module Architecture

```
ReportingDashboardsModule
├── controllers/
│   ├── dashboard.controller.ts    @Controller("api/v1/dashboards")
│   └── export.controller.ts       @Controller("api/v1/reports")
├── services/
│   ├── dashboard.service.ts       portfolio-health, capacity-heatmap, risk-summary
│   └── export.service.ts          toCsv, row-limit guard, filename generation
└── reporting-dashboards.module.ts
```

## Component Responsibilities

### `DashboardController`
- `GET /api/v1/dashboards/portfolio-health` → `DashboardService.getPortfolioHealth(portfolioId, ctx)`
- `GET /api/v1/dashboards/capacity-heatmap` → `DashboardService.getCapacityHeatmap(filter, ctx)` (delegates to UtilizationService)
- `GET /api/v1/dashboards/risk-summary` → `DashboardService.getRiskSummary(filter, ctx)` (delegates to RaidItemService)

### `ExportController`
- `GET /api/v1/reports/export` → `ExportService.exportCsv(reportType, params, ctx, res)`
- Sets `Content-Type: text/csv` and `Content-Disposition: attachment` on the NestJS `Response`

### `DashboardService`
Injected dependencies:
- `ProjectQueryService` (from ProjectExecutionModule)
- `UtilizationService` (from ResourceManagementModule)
- `RaidItemService` (from RiskRaidModule)
- `PrismaService` (cross-schema alignment query)

```typescript
async getPortfolioHealth(portfolioId: string, ctx: AuthContext): Promise<PortfolioHealthDashboardDTO> {
  const [rollup, atRiskProjects, escalatedRisks, alignmentStats] = await Promise.all([
    this.projectQueryService.getPortfolioRollup(portfolioId, null, ctx),
    this.projectQueryService.getAtRiskProjects(portfolioId, ctx),
    this.raidItemService.listRaidItems({ escalated: true, page: 1, pageSize: 5 }, ctx),
    this.getAlignmentCoverage(portfolioId),
  ]);
  ...
}

private async getAlignmentCoverage(portfolioId: string) {
  const [activeCount, alignedCount] = await this.prisma.$transaction([
    this.prisma.projectAlignmentView.count({ where: { portfolioId, status: { not: 'Cancelled' } } }),
    this.prisma.projectAlignmentView.count({ where: { portfolioId, aligned: true, status: { not: 'Cancelled' } } }),
  ]);
  return { activeCount, alignedCount, coveragePct: activeCount > 0 ? Math.round((alignedCount / activeCount) * 100) : 0 };
}
```

### `ExportService`
```typescript
toCsv(rows: object[]): string  // pure, deterministic
export async exportCsv(reportType, params, ctx): Promise<{ csv: string; filename: string; rowCount: number }>
```

## RBAC Grants

| Role | Permissions |
|------|-------------|
| EPMO_DIRECTOR | dashboard:read |
| PORTFOLIO_MANAGER | dashboard:read |
| PROGRAM_MANAGER | dashboard:read |
| PROJECT_MANAGER | dashboard:read |
| RESOURCE_MANAGER | dashboard:read |
| EXECUTIVE_SPONSOR | dashboard:read |
