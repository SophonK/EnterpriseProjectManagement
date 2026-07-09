# reporting-dashboards — API Specification

## Error Codes

| Code | HTTP | Title |
|------|------|-------|
| REPORT_001 | 400 | Report validation failed |
| REPORT_002 | 400 | Export row limit exceeded |
| REPORT_003 | 400 | Unknown report type |

## Endpoints

### GET /api/v1/dashboards/portfolio-health
Portfolio health composite view.

**Permission**: `dashboard:read`

**Query**: `portfolioId` (required)

**Response 200**:
```json
{
  "portfolioId": "uuid",
  "rollup": { "onTrackCount": 5, "atRiskCount": 2, "offTrackCount": 1, "totalCount": 8 },
  "alignment": { "alignedCount": 6, "activeCount": 8, "coveragePct": 75.0 },
  "topEscalatedRisks": [ /* up to 5 RaidItemDTO */ ],
  "atRiskProjects": [ /* ProjectDTO[] */ ]
}
```

---

### GET /api/v1/dashboards/capacity-heatmap
Capacity/utilization heatmap (delegates to UtilizationService).

**Permission**: `utilization:read`

**Query**: `from` (YYYY-MM), `to` (YYYY-MM), `poolId?`

**Response 200**: `UtilizationDTO`

---

### GET /api/v1/dashboards/risk-summary
Risk summary report (delegates to RaidItemService).

**Permission**: `raid:read`

**Query**: `projectId?`, `type?`, `status?`, `page?`, `pageSize?`

**Response 200**: `RaidListDTO`

---

### GET /api/v1/reports/export
Export a report as CSV.

**Permission**: `dashboard:read`

**Query**: `reportType` (portfolio-health | capacity | risk-summary), `portfolioId?`, `from?`, `to?`, `projectId?`

**Response 200**: `text/csv` with `Content-Disposition: attachment`

**Errors**: REPORT_001 (missing params), REPORT_002 (>1000 rows), REPORT_003 (unknown type)

---

## DTOs

### `PortfolioHealthDashboardDTO`
```typescript
interface PortfolioHealthDashboardDTO {
  portfolioId: string;
  rollup: RollupSummaryDTO;
  alignment: { alignedCount: number; activeCount: number; coveragePct: number };
  topEscalatedRisks: RaidItemDTO[];
  atRiskProjects: ProjectDTO[];
}
```
