# NFR Design — resource-management

## Security patterns

### RBAC + record scoping
`RbacGuard` checks `AuthContext.roles` against the registered permission for each handler. For list queries, `buildResourceScopeWhere(ctx)` injects a `poolId: { in: ctx.recordScopes }` filter when the caller is `RESOURCE_MANAGER`. Same pattern as `buildScopeWhere` in project-execution.

```typescript
function buildResourceScopeWhere(ctx: AuthContext): Prisma.ResourceWhereInput {
  if (ctx.roles.includes("EPMO_DIRECTOR")) return {};
  const poolIds = ctx.recordScopes.filter((s) => s.type === "pool").map((s) => s.id);
  return { poolId: { in: poolIds } };
}
```

### Soft-FK projectId validation
`AllocationService.allocate()` calls `projectService.getProject(projectId, ctx)` before persisting. If the project is not found or out of the caller's scope, throws `AppError("RESOURCE_002", ...)`. This ensures resource managers cannot allocate to projects they can't see.

### Audit
Every `create/update/delete` in `ResourceService` and `AllocationService` calls `auditService.record(...)` with `before`/`after` snapshots.

## Resiliency patterns

### Atomic over-allocation update
```typescript
const [allocation, _resource] = await this.prisma.$transaction([
  this.prisma.allocation.create({ data: ... }),
  this.prisma.resource.update({ where: { id: resourceId }, data: { overAllocated: isOverAllocated } }),
]);
```

### Idempotent event handlers
`ResourceManagementEventSub` uses foundation `makeIdempotent` helper. `project.created` handler is a no-op if `projectId` already in `processed_events` for that handler.

### requestId idempotency on allocation writes
`AllocationService.allocate(cmd, ctx, requestId)` uses `makeIdempotent` keyed by `(requestId, "allocate")`. Retried HTTP calls with the same `X-Request-Id` return the cached result without double-writing.
