# reporting-dashboards — Functional Design

## BR-1: Portfolio Health Dashboard (US-012)
Returns a composite view for a portfolio containing:
- **Rollup counts**: `onTrackCount`, `atRiskCount`, `offTrackCount`, `totalCount` (from `ProjectQueryService.getPortfolioRollup`)
- **Alignment coverage**: `alignedCount / activeCount` as a percentage (from `strategy.project_alignment_view WHERE portfolioId = ?`)
- **Top escalated risks**: up to 5 escalated RAID items ordered by `riskScore DESC` (from `RaidItemService.listRaidItems`)
- **At-risk/off-track projects**: list for drill-down (from `ProjectQueryService.getAtRiskProjects`)

If `portfolioId` is not accessible for the caller → inherits EXECUTION_005 / scope check from `ProjectQueryService`.

## BR-2: Capacity Heatmap Dashboard (US-013)
Delegates entirely to `UtilizationService.getUtilization(filter, ctx)`. Returns the same `UtilizationDTO` shape — no additional aggregation. Permission: `utilization:read`.

## BR-3: Risk Summary Report (US-014)
Delegates entirely to `RaidItemService.listRaidItems(filter, ctx)` with optional filters `projectId`, `type`, `status`, and default ordering by `riskScore DESC`. Permission: `raid:read`.

## BR-4: CSV Export (US-015)
- Accepts `reportType`: `portfolio-health | capacity | risk-summary`
- Fetches the corresponding dataset (same data as the dashboard endpoint)
- Serialises to CSV via `toCsv(data: object[]): string`
- If row count > `EXPORT_ROW_LIMIT` (default 1000) → REPORT_002 with message including current count
- Returns `Content-Type: text/csv`, `Content-Disposition: attachment; filename="<reportType>-<date>.csv"`

## toCsv Algorithm
```
function toCsv(rows: object[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape((r as Record<string, unknown>)[h])).join(","))
  ].join("\n");
}
```
This function is pure and deterministic: same input → same output (P1, P2 PBT properties).
