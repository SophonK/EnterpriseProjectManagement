# Implementation — project-execution

## Directory Layout

```
apps/api/src/modules/project-execution/
├── project-execution.module.ts          NestJS module definition; exports ProjectService, ProjectQueryService
├── controllers/
│   ├── project.controller.ts            POST/GET/PATCH/DELETE /api/v1/projects
│   ├── milestone.controller.ts          POST/GET/PATCH/DELETE /api/v1/projects/:id/milestones
│   ├── status.controller.ts             POST/GET /api/v1/projects/:id/status
│   └── rollup.controller.ts             GET /api/v1/portfolios/:id/rollup
├── services/
│   ├── project.service.ts               Command handler + domain rules
│   ├── milestone.service.ts             Milestone commands + overdue check
│   ├── rollup.service.ts                Roll-up recomputation
│   └── project-query.service.ts         Read-side queries (in-process API for other units)
├── repositories/
│   ├── project.repository.ts            Prisma CRUD + scope filter
│   ├── milestone.repository.ts          Prisma + overdue flag materialization
│   ├── status-update.repository.ts      Append-only inserts
│   └── rollup-snapshot.repository.ts    Upsert + read
├── events/
│   ├── project-execution-event.sub.ts   DemandPromoted handler
│   └── project-execution-event.pub.ts   publish helpers (ProjectCreated, StatusChanged, etc.)
├── dto/
│   ├── create-project.dto.ts            Zod schema + inferred type
│   ├── update-project.dto.ts
│   ├── add-milestone.dto.ts
│   ├── update-milestone.dto.ts
│   └── update-status-health.dto.ts
└── __tests__/
    ├── project.service.spec.ts          Unit tests + PBT (P1–P5)
    ├── rollup.service.spec.ts
    ├── milestone.service.spec.ts
    └── project.integration.spec.ts      Testcontainers integration tests
```

## Build Order

1. `packages/shared` — add `ProjectDTO`, `MilestoneDTO`, `StatusUpdateDTO`, `RollupSummaryDTO`, event payload types, error codes `EXECUTION_001–004`
2. `packages/db` — add Prisma models (`Project`, `Milestone`, `StatusUpdate`, `RollupSnapshot`) + migration `YYYYMMDD_execution_init`
3. `apps/api/src/modules/project-execution` — implement in order:
   a. Repositories (test with Testcontainers)
   b. Services (unit tests + PBT)
   c. Event subscriber
   d. Controllers
   e. Module registration in `apps/api/src/main.ts`

## Module Registration

```typescript
// apps/api/src/app.module.ts
@Module({
  imports: [
    FoundationModule,
    IdentityAccessModule,
    StrategyPortfolioModule,   // must be imported before project-execution
    ProjectExecutionModule,    // exports ProjectService, ProjectQueryService
    // ... downstream units
  ],
})
export class AppModule {}
```

## Definition of Done

- [ ] All 4 user stories (US-016, US-017, US-018, US-019) have passing integration tests
- [ ] PBT properties P1–P5 pass
- [ ] `packages/shared` exports new DTOs + error codes
- [ ] Migration applied to local Postgres via `pnpm db:migrate`
- [ ] All endpoints return RFC 7807 errors on failure paths
- [ ] Audit trail entries written for create/update/delete (verified in integration test)
- [ ] `GET /health` still passes with module registered
- [ ] `RollupSnapshot` updated after status change (verified in integration test)
- [ ] TypeScript strict mode: no `any`, no implicit `any`
- [ ] ESLint + Prettier pass
- [ ] CI pipeline green (lint → test → integration → build)
