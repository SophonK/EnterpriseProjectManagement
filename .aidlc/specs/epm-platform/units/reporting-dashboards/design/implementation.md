# reporting-dashboards — Implementation Plan

## Directory Layout

```
apps/api/src/modules/reporting-dashboards/
├── controllers/
│   ├── dashboard.controller.ts
│   └── export.controller.ts
├── services/
│   ├── dashboard.service.ts
│   └── export.service.ts
├── __tests__/
│   └── export.service.test.ts   (PBT P1-P3 + unit assertions)
└── reporting-dashboards.module.ts

packages/shared/src/
├── types/reporting-dashboards.ts
└── errors/report-error-codes.ts

packages/db/prisma/
└── migrations/0009_reporting_schema_init/migration.sql
```

## Build Waves

### Wave 1 — Shared contracts
- `packages/shared/src/types/reporting-dashboards.ts` — PortfolioHealthDashboardDTO + filter types
- `packages/shared/src/errors/report-error-codes.ts` — REPORT_001–003
- `packages/shared/src/index.ts` — add 2 exports
- Rebuild `@epm/shared`

### Wave 2 — Database
- `0009_reporting_schema_init/migration.sql` — `CREATE SCHEMA IF NOT EXISTS reporting` (no tables)

### Wave 3 — Services
- `export.service.ts` — `toCsv()` pure helper + `exportCsv()` with row-limit guard
- `dashboard.service.ts` — `getPortfolioHealth()`, `getCapacityHeatmap()`, `getRiskSummary()`

### Wave 4 — Controllers + Module + App
- `dashboard.controller.ts`
- `export.controller.ts`
- `reporting-dashboards.module.ts`
- `apps/api/src/app.module.ts` — add ReportingDashboardsModule last

### Wave 5 — Tests
- `export.service.test.ts` — PBT P1–P3 + 7 deterministic assertions

## Definition of Done

- [ ] 229 + new tests all green
- [ ] `@epm/shared` rebuilt
- [ ] `pnpm --filter @epm/db exec prisma validate`
- [ ] All 5 waves complete
- [ ] Manifest updated: reporting-dashboards `status: completed`
