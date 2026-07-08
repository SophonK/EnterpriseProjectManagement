# NFR Requirements — project-execution

## Security

| ID | Requirement | Measure |
|----|-------------|---------|
| SEC-EX-01 | All endpoints require a valid JWT | 401 on missing/invalid token; tested in integration suite |
| SEC-EX-02 | RBAC enforced per action | 403 returned for unauthorized role; see permission matrix in components.md |
| SEC-EX-03 | Record-scope filter applied to all list/read queries | Project Manager cannot see other PMs' projects; integration test verifies |
| SEC-EX-04 | Audit entry written on every create/update/delete/archive | Verified by integration test asserting `audit_log` row exists post-mutation |
| SEC-EX-05 | Input validated at controller boundary | Unknown fields rejected; Zod strips and rejects on strict mode |

## Reliability

| ID | Requirement | Measure |
|----|-------------|---------|
| REL-EX-01 | `DemandPromoted` handler is idempotent | Re-processing the same event produces no duplicate project; integration test replays the event twice |
| REL-EX-02 | Roll-up recomputation does not fail silently | Any DB error during roll-up is logged at `error` level and triggers a `500` on the event handler (retried by bus) |
| REL-EX-03 | Module graceful shutdown | In-flight requests complete before shutdown; drain timeout 10 s |

## Performance

| ID | Requirement | Measure |
|----|-------------|---------|
| PERF-EX-01 | `GET /api/v1/projects` p95 < 200 ms at 50 concurrent users, up to 1 000 projects per portfolio | Partial index on `(portfolioId)` WHERE `archived_at IS NULL`; pagination max 100 |
| PERF-EX-02 | `GET /portfolios/:id/rollup` p95 < 100 ms | Reads pre-computed `rollup_snapshot` — no aggregation at query time |
| PERF-EX-03 | Roll-up recomputation < 500 ms for portfolios with up to 500 projects | Single `GROUP BY` on indexed column |

## Availability

| ID | Requirement | Measure |
|----|-------------|---------|
| AVL-EX-01 | Contributes to overall API 99.5% availability target | No external dependencies beyond Postgres (already part of infra) |
| AVL-EX-02 | Milestone overdue reads must not block portfolio list performance | Overdue flag materialized on write; no per-request date computation on list queries |

## Observability

| ID | Requirement | Measure |
|----|-------------|---------|
| OBS-EX-01 | All mutations logged with `userId`, `projectId`, action | Pino structured log; correlation via `X-Request-Id` |
| OBS-EX-02 | Invalid state transitions logged at `warn` level | Enables monitoring for unexpected client behavior |
