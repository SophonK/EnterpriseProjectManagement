# Implementation — resource-management

## Directory layout
```
apps/api/src/modules/resource-management/
├── controllers/
│   ├── resource.controller.ts
│   ├── allocation.controller.ts
│   ├── utilization.controller.ts
│   └── capacity.controller.ts
├── services/
│   ├── resource.service.ts
│   ├── allocation.service.ts
│   ├── utilization.service.ts
│   └── capacity.service.ts
├── repositories/
│   ├── resource.repository.ts
│   ├── allocation.repository.ts
│   └── capacity-period.repository.ts
├── events/
│   └── resource-management-event.sub.ts
├── resource-management.module.ts
└── __tests__/
    ├── resource.service.test.ts
    ├── allocation.service.test.ts
    ├── repositories.test.ts
    ├── event-subscriber.test.ts
    └── resource-management.int.test.ts

packages/shared/src/
├── types/resource-management.ts           (DTOs, command types, enums)
├── errors/resource-error-codes.ts         (RESOURCE_001–005)
└── events/resource-management-events.ts  (event constants + payload interfaces)

packages/db/prisma/
└── migrations/0007_resource_init/migration.sql
```

## Build order (Waves)
| Wave | Tasks | Deliverable |
|---|---|---|
| 1 | Shared types + error codes + events in `@epm/shared`; Prisma models + migration | Compiles; migration applied |
| 2 | Repositories: ResourceRepository, AllocationRepository, CapacityPeriodRepository | Unit-testable data layer |
| 3 | Services: ResourceService, AllocationService (with over-alloc logic), UtilizationService, CapacityService | Domain logic with PBT |
| 4 | Controllers + ResourceManagementModule wiring + app.module import | Full HTTP surface |
| 5 | Event subscriber + integration tests (`*.int.test.ts`) | End-to-end verified |

## Definition of Done (per task)
- [ ] TypeScript compiles with no errors (`pnpm build`)
- [ ] Unit tests pass (`pnpm test`)
- [ ] PBT properties pass (P1–P4 in correctness.md)
- [ ] RBAC: each endpoint rejects wrong role with 403
- [ ] Audit entries written on mutations
- [ ] Migration reviewed (no breaking changes to existing schemas)
- [ ] Integration test covers golden path (create resource → allocate → utilization view)
