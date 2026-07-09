# risk-raid — Component Design

## Module Architecture

```
RiskRaidModule
├── controllers/
│   ├── raid.controller.ts          @Controller("api/v1/raid")
│   └── dependency.controller.ts    @Controller("api/v1/dependencies")
├── services/
│   ├── raid-item.service.ts        createRaidItem, updateRaidItem, deleteRaidItem, getRaidItem, listRaidItems
│   └── dependency.service.ts       linkDependency, unlinkDependency, getDependency, listDependencies
├── repositories/
│   ├── raid-item.repository.ts     CRUD + scope filter + findEscalatable
│   └── dependency.repository.ts    CRUD + circular-dep check
├── events/
│   └── risk-raid-event.sub.ts      subscribes project.created + project.archived
└── risk-raid.module.ts             wires all providers + RBAC grants
```

## Component Responsibilities

### `RaidController`
- `POST /api/v1/raid` → `RaidItemService.createRaidItem(cmd, ctx, requestId)`
- `GET /api/v1/raid` → `RaidItemService.listRaidItems(filter, ctx)`
- `GET /api/v1/raid/:id` → `RaidItemService.getRaidItem(id, ctx)`
- `PATCH /api/v1/raid/:id` → `RaidItemService.updateRaidItem(id, cmd, ctx)`
- `DELETE /api/v1/raid/:id` → `RaidItemService.deleteRaidItem(id, ctx)`
- Validates with `ZodValidationPipe(CreateRaidItemSchema, "RISK_001")` and `ZodValidationPipe(UpdateRaidItemSchema, "RISK_001")`

### `DependencyController`
- `POST /api/v1/dependencies` → `DependencyService.linkDependency(cmd, ctx, requestId)`
- `GET /api/v1/dependencies` → `DependencyService.listDependencies(filter, ctx)`
- `GET /api/v1/dependencies/:id` → `DependencyService.getDependency(id, ctx)`
- `DELETE /api/v1/dependencies/:id` → `DependencyService.unlinkDependency(id, ctx)`

### `RaidItemService`
Key method: `createRaidItem(cmd, ctx, requestId)`:
1. Validate projectId via `ProjectService.getProject()` → RISK_002 if not found
2. Compute `riskScore = cmd.severity * cmd.probability` (null for non-Risk)
3. Determine initial status: `Open` (if no ownerId) or `InProgress` (if ownerId provided)
4. Persist via `raidItemRepo.create()`
5. Evaluate escalation: if `riskScore >= ESCALATION_THRESHOLD` → update `escalated=true`, publish `RISK_RAID_EVENTS.RISK_ESCALATED`
6. Publish `RISK_RAID_EVENTS.RAID_LOGGED`
7. Return `RaidItemDTO`

Key method: `updateRaidItem(id, cmd, ctx)`:
1. `findByIdOrThrow(id, ctx)` → RISK_004
2. Validate status transition via `isValidTransition(current, cmd.status)` → RISK_005
3. Recompute `riskScore` if severity/probability changed
4. Set `closedBy`/`closedAt` if transitioning to terminal status
5. Auto-transition to `InProgress` if `ownerId` set and currently `Open`
6. Persist update
7. Re-evaluate escalation

### `DependencyService`
Key method: `linkDependency(cmd, ctx, requestId)`:
1. Validate `fromProjectId !== toProjectId` → RISK_001
2. Validate both projects via `ProjectService.getProject()` → RISK_002
3. Check reverse pair: `dependencyRepo.findByPair(cmd.toProjectId, cmd.fromProjectId)` → RISK_003 if exists
4. Persist via `dependencyRepo.create()`
5. Publish `RISK_RAID_EVENTS.DEPENDENCY_LINKED`
6. Return `DependencyDTO`

### `RaidItemRepository`
```typescript
buildScopeWhere(ctx: AuthContext): Prisma.RaidItemWhereInput
findByIdOrThrow(id: string, ctx: AuthContext): Promise<RaidItem>
create(data: CreateRaidItemData): Promise<RaidItem>
update(id: string, data: UpdateRaidItemData): Promise<RaidItem>
delete(id: string): Promise<void>
findMany(filter: RaidItemFilter, ctx: AuthContext): Promise<[RaidItem[], number]>
```

### `DependencyRepository`
```typescript
findByPair(fromProjectId: string, toProjectId: string): Promise<Dependency | null>  // circular check
findByIdOrThrow(id: string): Promise<Dependency>
create(data: CreateDependencyData): Promise<Dependency>
delete(id: string): Promise<void>
findMany(filter: DependencyFilter): Promise<[Dependency[], number]>
```

### `RiskRaidEventSub`
- `PROJECT_EXECUTION_EVENTS.PROJECT_CREATED` → no-op (idempotent, log only)
- `PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED` → `raidItemRepo.closeAllForProject(projectId)` — updates Open/InProgress items to Closed

## RBAC Grants

| Role | Permissions |
|------|-------------|
| EPMO_DIRECTOR | raid:read, raid:write, dependency:read, dependency:write |
| PORTFOLIO_MANAGER | raid:read, raid:write, dependency:read, dependency:write |
| PROGRAM_MANAGER | raid:read, raid:write, dependency:read, dependency:write |
| PROJECT_MANAGER | raid:read, raid:write, dependency:read |
| RESOURCE_MANAGER | raid:read, dependency:read |
| EXECUTIVE_SPONSOR | raid:read, dependency:read |
