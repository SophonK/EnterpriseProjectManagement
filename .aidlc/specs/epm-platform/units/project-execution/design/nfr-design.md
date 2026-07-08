# NFR Design — project-execution

## Security Patterns

### Request Lifecycle (security view)
```
HTTP Request
  → AuthGuard (JWT verification via foundation JwtService)
  → RolesGuard (@RequirePermission — checks role from AuthContext)
  → RecordScopeGuard (scopes query filters from AuthContext.recordScopes)
  → Controller (Zod validation via ZodValidationPipe)
  → Service (domain logic + business rules)
  → Repository (applies scope filter if not EPMO Director)
  → AuditInterceptor (post-response: writes audit entry)
```

### RBAC Implementation
- `@RequirePermission('project:create')` — decorator on controller handler
- `AuthContext.roles` checked against permission map in `RolesGuard`
- Permission map defined in `@epm/shared/permissions.ts` (single source of truth)

### Record Scope Enforcement
```typescript
// ProjectRepository.findMany()
const scopeFilter = ctx.roles.includes('EPMO_DIRECTOR')
  ? {}
  : ctx.roles.includes('PORTFOLIO_MANAGER')
    ? { portfolioId: { in: ctx.recordScopes.portfolios } }
    : { ownerUserId: ctx.userId };

return prisma.project.findMany({
  where: { ...scopeFilter, archivedAt: null, ...userFilter }
});
```

## Resiliency Patterns

### Idempotent Event Handling
```typescript
// ProjectExecutionEventSub.onDemandPromoted()
const existing = await projectRepo.findBySourceDemandId(event.payload.demandId);
if (existing) return; // already created — no-op
await projectService.createProject({ ...mappedFields, sourceDemandId: event.payload.demandId }, systemCtx);
```

### Roll-Up Failure Isolation
The roll-up recomputation is not in the request path — it runs asynchronously after `StatusChanged` is published. If it fails:
1. The `StatusUpdate` is already committed (durable)
2. The roll-up snapshot remains at the previous state
3. Error is logged at `error` level
4. The event bus retries (configurable, default 3 attempts with exponential backoff)

### Database Exception Mapping
Prisma errors are caught by the global `PrismaExceptionFilter` (foundation):
- `P2002` (unique violation) → `EXECUTION_004` (409 Conflict)
- `P2025` (record not found) → `NOT_FOUND` (404)
- Others → `INTERNAL` (500)

## Performance Design

### Index Strategy
```sql
-- Supports scoped list queries
CREATE INDEX idx_project_portfolio ON execution.project(portfolio_id)
  WHERE archived_at IS NULL;

-- Supports at-risk portfolio view
CREATE INDEX idx_project_health ON execution.project(portfolio_id, health)
  WHERE archived_at IS NULL;

-- Supports roll-up GROUP BY
CREATE INDEX idx_project_program ON execution.project(program_id)
  WHERE program_id IS NOT NULL AND archived_at IS NULL;
```

### Roll-Up Snapshot Pattern
The `rollup_snapshot` table is an in-database materialized view equivalent. It trades slightly stale counts (updated per-event) for O(1) read latency on the rollup endpoint. For MVP with hundreds of projects, the staleness window is < 1 second (in-process event delivery).

## Logging

All service methods wrap their core logic with:
```typescript
this.logger.info({ projectId, userId: ctx.userId, action: 'createProject' }, 'project created');
```

On errors:
```typescript
this.logger.warn({ projectId, from, to }, 'invalid status transition attempted');
```
