# NFR Requirements — resource-management

## Security
| ID | Requirement | Measure |
|---|---|---|
| SEC-RM-1 | All endpoints require valid JWT | 401 on missing/expired token |
| SEC-RM-2 | RBAC enforced per endpoint | 403 for insufficient role |
| SEC-RM-3 | Record-scoping: RESOURCE_MANAGER pool-restricted | Pool filter applied to all list/read queries |
| SEC-RM-4 | Audit trail on every mutation | AuditLog entry created synchronously |
| SEC-RM-5 | No existence leak on 404 | RESOURCE_005 regardless of not-found vs out-of-scope |

## Resiliency
| ID | Requirement | Measure |
|---|---|---|
| RES-RM-1 | Over-allocation update is atomic | Single Prisma `$transaction` |
| RES-RM-2 | Event handlers are idempotent | ProcessedEvent dedup by eventId |
| RES-RM-3 | Allocation write is idempotent | Foundation idempotency ledger keyed by requestId |
| RES-RM-4 | Invalid projectId rejected before save | getProject() called before allocation persist |

## Performance
| ID | Requirement | Measure |
|---|---|---|
| PERF-RM-1 | Utilization query completes <500ms for 100 resources × 12 months | Covered by overlap index |
| PERF-RM-2 | Range input max 12 months | Validated in controller (RESOURCE_001 if exceeded) |
