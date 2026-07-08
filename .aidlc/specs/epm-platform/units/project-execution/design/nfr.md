# NFR (Compact) — project-execution

## Security (security-baseline, blocking)

| Control | Implementation |
|---------|---------------|
| Authentication | JWT from foundation `AuthGuard`; all endpoints require valid token |
| Authorization | Per-handler `@RequirePermission()` + `RecordScopeGuard`; deny-by-default |
| Record scoping | `AuthContext.recordScopes` applied in repository queries; EPMO Director bypasses |
| Input validation | Zod schemas at controller boundary; reject unknown fields |
| Audit trail | `AuditService.record()` on every create/update/delete via `AuditInterceptor` |
| No cross-schema writes | `project-execution` never writes to another unit's schema |

## Resiliency (resiliency-baseline, blocking)

| Concern | Implementation |
|---------|---------------|
| Health check | Module contributes to `/health` liveness via `HealthCheckService` |
| Graceful shutdown | NestJS `enableShutdownHooks()`; in-flight requests drain before exit |
| Database errors | Prisma exceptions caught by global `PrismaExceptionFilter`; mapped to RFC 7807 |
| Idempotent event handler | `DemandPromoted` handler checks `sourceDemandId` before creating project |
| Roll-up eventual consistency | Roll-up snapshot is best-effort; stale by at most one event cycle; consumers must tolerate this |

## Performance

| Target | Approach |
|--------|----------|
| `GET /projects` p95 < 200 ms | Partial indexes on `(portfolioId)`, pagination enforced (max 100/page) |
| `GET /portfolios/:id/rollup` p95 < 100 ms | Read from `rollup_snapshot` (no aggregation at query time) |
| Roll-up recomputation < 500 ms | Single `GROUP BY` query on indexed `(portfolioId, health)` column |

## Observability

- Structured JSON logs (pino) with `requestId`, `userId`, `projectId` on all operations
- Log level `warn` on invalid status transitions; `error` on unexpected DB failures
