# risk-raid — Implementation Tasks

## Summary
- **Total tasks**: 28
- **Waves**: 5 (contracts → DB → repositories → services → controllers/tests)
- **Owner**: Chavakorn
- **Complexity notes**: `RaidItemService.createRaidItem` is size **M** (escalation logic + event publish); `RaidItemService.updateRaidItem` is size **M** (status machine + re-escalation)

---

## Wave 1 — Shared Contracts (`@epm/shared`)

### Task 1.1 — Create `packages/shared/src/types/risk-raid.ts`
**Size**: M  
Exports:
- Const arrays + types: `RAID_TYPE`, `RAID_STATUS`, `DEPENDENCY_TYPE`, `RISK_BAND`
- Interfaces: `RaidItemDTO`, `DependencyDTO`, `RaidListDTO`, `DependencyListDTO`, `RaidSummaryDTO`
- Pure functions: `computeRiskScore(severity, probability)` → `number | null`; `riskBand(score)` → `RiskBand`
- Zod schemas: `CreateRaidItemSchema`, `UpdateRaidItemSchema`, `CreateDependencySchema`, `RaidFilterSchema`

**DoD**: All types compile, `computeRiskScore(4,4)` === 16, `riskBand(15)` === `'Critical'`.

---

### Task 1.2 — Create `packages/shared/src/errors/risk-error-codes.ts`
**Size**: S  
Side-effect file; calls `registerErrorCodes({ RISK_001 … RISK_005 })`.

| Code | Status | Title |
|------|--------|-------|
| RISK_001 | 400 | RAID item validation failed |
| RISK_002 | 404 | Referenced project not found |
| RISK_003 | 409 | Duplicate or circular dependency |
| RISK_004 | 404 | RAID item or dependency not found |
| RISK_005 | 422 | Invalid status transition |

---

### Task 1.3 — Create `packages/shared/src/events/risk-raid-events.ts`
**Size**: S  
Exports `RISK_RAID_EVENTS` const + payload interfaces: `RaidLoggedPayload`, `RiskEscalatedPayload`, `DependencyLinkedPayload`.

---

### Task 1.4 — Update `packages/shared/src/index.ts`
**Size**: XS  
Append three lines:
```typescript
export * from "./types/risk-raid.js";
export * from "./errors/risk-error-codes.js";
export * from "./events/risk-raid-events.js";
```

---

### Task 1.5 — Rebuild `@epm/shared`
**Size**: XS  
`pnpm --filter @epm/shared build` — ensures dist includes new exports before service imports are resolved in tests.

---

## Wave 2 — Database

### Task 2.1 — Add `RaidItem` model to `packages/db/prisma/schema.prisma`
**Size**: S  
```prisma
model RaidItem {
  id          String    @id @default(uuid())
  projectId   String
  type        String
  title       String
  description String?
  severity    Int?
  probability Int?
  riskScore   Int?
  status      String    @default("Open")
  escalated   Boolean   @default(false)
  ownerUserId String?
  mitigation  String?
  closedBy    String?
  closedAt    DateTime?
  createdBy   String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([projectId])
  @@index([escalated])
  @@index([status])
  @@map("raid_item")
  @@schema("risk")
}
```

---

### Task 2.2 — Add `Dependency` model to `packages/db/prisma/schema.prisma`
**Size**: S  
```prisma
model Dependency {
  id             String   @id @default(uuid())
  fromProjectId  String
  toProjectId    String
  description    String
  dependencyType String   @default("DependsOn")
  createdBy      String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([fromProjectId, toProjectId])
  @@index([fromProjectId])
  @@index([toProjectId])
  @@map("dependency")
  @@schema("risk")
}
```

---

### Task 2.3 — Create migration `packages/db/prisma/migrations/0008_risk_raid_init/migration.sql`
**Size**: S  
Creates `risk` schema + both tables with CHECK constraints (`type_check`, `status_check`, `risk_fields_check`, `no_self_loop`) + indexes.

---

## Wave 3 — Repositories

### Task 3.1 — Create `apps/api/src/modules/risk-raid/repositories/raid-item.repository.ts`
**Size**: M  
Methods:
- `buildScopeWhere(ctx)` — EPMO_DIRECTOR: `{}`; PORTFOLIO_MANAGER/PROGRAM_MANAGER/PROJECT_MANAGER: `{ projectId: { in: projectIds } }` from `ctx.recordScopes`
- `findByIdOrThrow(id, ctx)` — applies scope, throws `RISK_004`
- `create(data)` → `RaidItem`
- `update(id, data)` → `RaidItem`
- `delete(id)` → `void`
- `findMany(filter, ctx)` → `[RaidItem[], number]`
- `closeAllForProject(projectId, closedAt)` → `number` (count of updated rows) — `updateMany` where `projectId=x AND status IN ('Open','InProgress')` → `{ status: 'Closed', closedBy: 'system', closedAt }`

---

### Task 3.2 — Create `apps/api/src/modules/risk-raid/repositories/dependency.repository.ts`
**Size**: S  
Methods:
- `findByPair(fromProjectId, toProjectId)` → `Dependency | null` (circular-dep check)
- `findByIdOrThrow(id)` → throws `RISK_004`
- `create(data)` → `Dependency`
- `delete(id)` → `void`
- `findMany(filter)` → `[Dependency[], number]` — filter: `projectId` matches `fromProjectId OR toProjectId`

---

## Wave 4 — Services + Event Subscriber

### Task 4.1 — Create `apps/api/src/modules/risk-raid/services/raid-item.service.ts` — `createRaidItem`
**Size**: M  
Steps:
1. Validate via `ProjectService.getProject(cmd.projectId, ctx)` → RISK_002
2. Compute `riskScore = cmd.severity * cmd.probability` (null for non-Risk)
3. Determine initial `status`: `Open` unless `ownerId` provided → `InProgress`
4. `raidItemRepo.create()`
5. Evaluate escalation: `riskScore >= ESCALATION_THRESHOLD && !escalated` → `raidItemRepo.update(id, { escalated: true })` + `eventBus.publish(RISK_RAID_EVENTS.RISK_ESCALATED)`
6. `auditService.record()`; `eventBus.publish(RISK_RAID_EVENTS.RAID_LOGGED)`
7. Return `RaidItemDTO`

`ESCALATION_THRESHOLD` read from `ConfigService` or env default 15.

---

### Task 4.2 — Add `updateRaidItem` to `raid-item.service.ts`
**Size**: M  
Steps:
1. `findByIdOrThrow(id, ctx)` → RISK_004
2. Validate status transition if `cmd.status` provided → RISK_005
3. Recompute `riskScore` if severity/probability changed
4. Auto-transition: if current `Open` and `cmd.ownerId` → set status `InProgress`
5. Set `closedBy = ctx.userId`, `closedAt = new Date()` if transitioning to terminal
6. `raidItemRepo.update(id, data)`
7. Re-evaluate escalation (same logic as create)
8. Return updated `RaidItemDTO`

`isValidTransition(from, to)` exported pure function (tested in PBT).

---

### Task 4.3 — Add `deleteRaidItem`, `getRaidItem`, `listRaidItems` to `raid-item.service.ts`
**Size**: S  
- `getRaidItem(id, ctx)` → `findByIdOrThrow` + map to DTO
- `listRaidItems(filter, ctx)` → `raidItemRepo.findMany` + map to `RaidListDTO`
- `deleteRaidItem(id, ctx)` → `findByIdOrThrow` + `raidItemRepo.delete` + `auditService.record`

---

### Task 4.4 — Create `apps/api/src/modules/risk-raid/services/dependency.service.ts`
**Size**: M  
- `linkDependency(cmd, ctx, requestId)`:
  1. Self-loop check → RISK_001
  2. Both projects validated → RISK_002
  3. `dependencyRepo.findByPair(cmd.toProjectId, cmd.fromProjectId)` → RISK_003 if exists
  4. `dependencyRepo.create()` — catches unique constraint violation → RISK_003
  5. `eventBus.publish(RISK_RAID_EVENTS.DEPENDENCY_LINKED)`; `auditService.record()`
  6. Return `DependencyDTO`
- `unlinkDependency(id, ctx)`, `getDependency(id)`, `listDependencies(filter, ctx)`

---

### Task 4.5 — Create `apps/api/src/modules/risk-raid/events/risk-raid-event.sub.ts`
**Size**: S  
- `RISK_RAID_IDEMPOTENCY_LEDGER` optional injection symbol
- `PROJECT_EXECUTION_EVENTS.PROJECT_CREATED` → no-op + idempotent return
- `PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED` → `raidItemRepo.closeAllForProject(event.data.projectId, new Date())`; log count

---

## Wave 5 — Controllers, Module, Tests

### Task 5.1 — Create `apps/api/src/modules/risk-raid/controllers/raid.controller.ts`
**Size**: S  
`@Controller("api/v1/raid")` — POST, GET, GET/:id, PATCH/:id, DELETE/:id using `ZodValidationPipe`.

---

### Task 5.2 — Create `apps/api/src/modules/risk-raid/controllers/dependency.controller.ts`
**Size**: S  
`@Controller("api/v1/dependencies")` — POST, GET, GET/:id, DELETE/:id.

---

### Task 5.3 — Create `apps/api/src/modules/risk-raid/risk-raid.module.ts`
**Size**: S  
- imports: `[DbModule, AuditModule, EventsModule, AuthModule, ProjectExecutionModule]`
- providers: repos, services, event sub, `{ provide: "PROJECT_SERVICE", useExisting: ProjectService }`
- exports: `[RaidItemService, DependencyService]` (consumed by reporting-dashboards)
- constructor: RBAC grants per component design

---

### Task 5.4 — Register `RiskRaidModule` in `apps/api/src/app.module.ts`
**Size**: XS  
Add import + add to `imports[]` after `ResourceManagementModule`.

---

### Task 5.5 — Create `apps/api/src/modules/risk-raid/__tests__/raid-item.service.test.ts` — PBT P1–P4
**Size**: M  
Four `describe` blocks for P1–P4 using `fast-check`.  
Side-effect import: `../../../../../../packages/shared/src/errors/risk-error-codes.js`

---

### Task 5.6 — Add deterministic unit assertions to `raid-item.service.test.ts`
**Size**: S  
Ten `it(...)` assertions from `correctness.md` covering score formula, escalation threshold, status transitions, circular dep, self-loop, and risk field validation.

---

### Task 5.7 — Run full test suite; verify green
**Size**: XS  
`pnpm --filter @epm/api exec vitest run` — all tests pass (≥ 220).

---

## Task Index

| # | Task | Wave | Size |
|---|------|------|------|
| 1.1 | types/risk-raid.ts | Contracts | M |
| 1.2 | errors/risk-error-codes.ts | Contracts | S |
| 1.3 | events/risk-raid-events.ts | Contracts | S |
| 1.4 | index.ts exports | Contracts | XS |
| 1.5 | Rebuild @epm/shared | Contracts | XS |
| 2.1 | RaidItem Prisma model | DB | S |
| 2.2 | Dependency Prisma model | DB | S |
| 2.3 | Migration 0008 | DB | S |
| 3.1 | RaidItemRepository | Repos | M |
| 3.2 | DependencyRepository | Repos | S |
| 4.1 | RaidItemService.createRaidItem | Services | M |
| 4.2 | RaidItemService.updateRaidItem | Services | M |
| 4.3 | RaidItemService.get/list/delete | Services | S |
| 4.4 | DependencyService | Services | M |
| 4.5 | RiskRaidEventSub | Services | S |
| 5.1 | RaidController | Controllers | S |
| 5.2 | DependencyController | Controllers | S |
| 5.3 | RiskRaidModule | Module | S |
| 5.4 | app.module.ts registration | Module | XS |
| 5.5 | PBT tests P1–P4 | Tests | M |
| 5.6 | Deterministic unit assertions | Tests | S |
| 5.7 | Full suite green | Tests | XS |
