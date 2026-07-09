# risk-raid — NFR Summary

| NFR | Target | Approach |
|-----|--------|---------|
| Response latency | p95 < 200ms (list/get) | Index on `project_id`, `escalated`, `status`; pagination default 25 |
| Escalation latency | Synchronous on write (< 50ms overhead) | Single update + event publish in same request; no background job |
| Availability | Inherits platform target (99.9%) | Standard NestJS + PostgreSQL; no external deps |
| Security | Deny-by-default RBAC; record-scoped reads | `@RequirePermission` per handler; `buildScopeWhere` on every list |
| Audit | All writes recorded | `AuditService.record()` on create/update/delete |
| Idempotency | Event handlers idempotent | `makeIdempotent(eventId, ledger)` on both subscribers |
| Data integrity | Circular dep and self-loop prevented at service layer + DB constraint | `@@unique([fromProjectId, toProjectId])` + `CHECK (from_project_id != to_project_id)` |
