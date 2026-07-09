# reporting-dashboards — NFR Summary

| NFR | Target | Approach |
|-----|--------|---------|
| Portfolio health p95 | < 500ms | Parallel `Promise.all` over 4 sub-queries; alignment count is simple index scan |
| Capacity heatmap p95 | < 300ms | Delegates to UtilizationService (already sub-300ms for ≤12 months) |
| Export p95 | < 2s for ≤1000 rows | Bounded by EXPORT_ROW_LIMIT; synchronous CSV serialisation is O(n) |
| Security | Deny-by-default | All handlers `@RequirePermission("dashboard:read")`; scope inherited from source services |
| Availability | 99.9% (platform SLA) | No external deps; inherits platform PostgreSQL HA |
| Phase 2 readiness | Schema reserved | `reporting` schema created empty; materialized snapshot tables added in Phase 2 |
