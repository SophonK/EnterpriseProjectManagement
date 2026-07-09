# risk-raid — Implementation Plan

## Directory Layout

```
apps/api/src/modules/risk-raid/
├── controllers/
│   ├── raid.controller.ts
│   └── dependency.controller.ts
├── services/
│   ├── raid-item.service.ts
│   └── dependency.service.ts
├── repositories/
│   ├── raid-item.repository.ts
│   └── dependency.repository.ts
├── events/
│   └── risk-raid-event.sub.ts
├── __tests__/
│   └── raid-item.service.test.ts   (PBT + unit)
└── risk-raid.module.ts

packages/shared/src/
├── types/risk-raid.ts
├── errors/risk-error-codes.ts
└── events/risk-raid-events.ts

packages/db/prisma/
├── schema.prisma                   (+ RaidItem, Dependency models)
└── migrations/0008_risk_raid_init/migration.sql
```

## Build Waves

### Wave 1 — Shared contracts
- `packages/shared/src/types/risk-raid.ts` — RaidItemDTO, DependencyDTO, enums, Zod schemas, `computeRiskScore`, `riskBand`
- `packages/shared/src/errors/risk-error-codes.ts` — RISK_001–005
- `packages/shared/src/events/risk-raid-events.ts` — RISK_RAID_EVENTS const + payload interfaces
- `packages/shared/src/index.ts` — add 3 exports

### Wave 2 — Database
- `packages/db/prisma/schema.prisma` — append `RaidItem`, `Dependency` models with `@@schema("risk")`
- `packages/db/prisma/migrations/0008_risk_raid_init/migration.sql`

### Wave 3 — Repositories
- `raid-item.repository.ts` — buildScopeWhere, findByIdOrThrow, create, update, delete, findMany, closeAllForProject
- `dependency.repository.ts` — findByPair, findByIdOrThrow, create, delete, findMany

### Wave 4 — Services + Event Subscriber
- `raid-item.service.ts` — createRaidItem, updateRaidItem, deleteRaidItem, getRaidItem, listRaidItems (escalation logic inline)
- `dependency.service.ts` — linkDependency, unlinkDependency, getDependency, listDependencies
- `risk-raid-event.sub.ts` — project.created no-op + project.archived close handler

### Wave 5 — Controllers + Module + App wiring
- `raid.controller.ts`
- `dependency.controller.ts`
- `risk-raid.module.ts` — imports ProjectExecutionModule, PROJECT_SERVICE token, RBAC grants
- `apps/api/src/app.module.ts` — add RiskRaidModule after ResourceManagementModule

### Wave 6 — Tests
- `raid-item.service.test.ts` — PBT P1–P4 + 10 deterministic unit assertions

## Definition of Done

- [ ] 212 + new tests all green (`pnpm --filter @epm/api exec vitest run`)
- [ ] `@epm/shared` rebuilt (`pnpm --filter @epm/shared build`)
- [ ] Prisma schema valid (`pnpm --filter @epm/db exec prisma validate`)
- [ ] All 5 waves + test wave complete
- [ ] Manifest updated: risk-raid `status: completed`, `completedTasks: N/N`
