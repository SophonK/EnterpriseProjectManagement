# NFR — resource-management (compact)

## Security (security-baseline)
- All endpoints require `Authorization: Bearer <JWT>`; unauthenticated → 401.
- RBAC guard checks permission per endpoint; unauthorised → 403.
- Record-scoping: RESOURCE_MANAGER sees only their pool's resources; EPMO_DIRECTOR sees all.
- `projectId` soft-FK validated via `ProjectService.getProject()` — caller's scope applied, preventing cross-scope resource allocation to hidden projects.
- Audit entry written on every create/update/delete (actor, entity, before/after, requestId).
- No sensitive fields in error responses; `RESOURCE_005` does not leak whether record exists for unauthorised caller.

## Resiliency (resiliency-baseline)
- Health check endpoint (`/healthz`) included via foundation; DB connectivity checked.
- Over-allocation check and `resource.overAllocated` flag update are in a single `$transaction` to prevent partial state.
- Idempotent event handlers (`project.created`, `project.archived`) keyed by `eventId` via `ProcessedEvent` table.
- `AllocationService` operations are idempotent per `requestId` (foundation idempotency ledger).
- Graceful degradation: if `ProjectService.getProject()` call throws unexpectedly, `AllocationService` propagates error rather than saving with unvalidated projectId.

## Performance
- Utilization and capacity-demand queries are bounded to max 12 months range (validated in controller).
- Overlap index on `(resource_id, period_start, period_end)` ensures efficient monthly summation.
- Pool-scoped queries include `poolId` filter utilising indexed column.
