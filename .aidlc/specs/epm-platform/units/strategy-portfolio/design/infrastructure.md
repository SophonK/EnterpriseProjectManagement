# Infrastructure — strategy-portfolio

## Summary

`strategy-portfolio` introduces **no new infrastructure**. It is a NestJS module inside the existing `apps/api` monolith and inherits the foundation deployment topology in full: a single shared Postgres instance with **schema-per-unit** isolation, GitHub Actions CI, a Docker multi-stage image, and rolling deploy. This unit adds exactly two things to that baseline — the `strategy` Postgres schema (created by the `YYYYMMDD_strategy_init` Prisma migration) and event-subscription wiring registered at application boot. No new cloud services, brokers, caches, or external dependencies are introduced.

## Inherited From Foundation (unchanged)

- **Runtime**: single NestJS process in `apps/api`; strategy-portfolio ships as a module within the same deployable — no separate service.
- **Database**: one shared Postgres instance; the `strategy` schema sits alongside `execution`, `identity`, and `shared` via Prisma multi-schema. Same connection pool, credentials, and `PrismaService`.
- **CI/CD**: GitHub Actions pipeline (lint → test → integration → build); Testcontainers spins Postgres for integration tests at runtime.
- **Packaging**: existing Docker multi-stage build; no new image or build stage.
- **Release**: rolling deploy of the single `apps/api` image.
- **Cross-cutting**: EventBus, transactional outbox + relay, idempotency ledger (`shared.processed_events`), RFC7807 errors, AuthGuard/RBAC, audit, pino logging — all consumed from the foundation kernel.

## Added By This Unit

| Item | What | Mechanism |
|------|------|-----------|
| `strategy` Postgres schema | Six models (`StrategicGoal`, `Portfolio`, `Program`, `PortfolioGoal`, `GoalLink`, `ProjectAlignmentView`) + three enums | Prisma migration `YYYYMMDD_strategy_init`, applied via `pnpm db:migrate` — same migration flow as every other unit |
| Event-subscription wiring | `ProjectAlignmentProjector` subscribes to `project-execution.project.created` / `.status-changed` at boot | `onModuleInit` calls `EventBus.subscribe(...)`; no new transport |
| Outbox publications | Four `strategy-portfolio.*` events written to the existing shared outbox table | `OutboxWriter.enqueue` inside the unit's Prisma transactions; existing `OutboxRelay` delivers them |

## Logical Component → Infrastructure Mapping

| Logical component | Runs on / backed by |
|-------------------|---------------------|
| `ProjectAlignmentProjector` (event subscriber) | Foundation in-process `EventBus` + `PrismaIdempotencyLedger` (`shared.processed_events`); no queue infra |
| `ProjectAlignmentView` (read-model projection) | Table in the `strategy` schema on the shared Postgres; indexed on `status`, `portfolioId` |
| Investment-mix aggregation query (US-009) | On-demand SQL (`GROUP BY` + `SUM`) over `strategy`-schema tables via `PrismaService`; no materialized store, no separate analytics engine |
| `unaligned` report query (US-010) | Indexed read on `ProjectAlignmentView` (`status`, `aligned`); same Postgres |
| Event publications (4 events) | Existing shared outbox table + `OutboxRelay`; same in-process bus |
| REST controllers | Existing `apps/api` HTTP server; foundation `AuthGuard` |

## Explicit Statement

**No new cloud services are introduced.** No message broker, no cache, no object store, no separate database, no additional container or service. Capacity, scaling, and deployment characteristics are those of the existing `apps/api` monolith and its shared Postgres; the performance target (investment-mix and unaligned queries p95 < 300ms at portfolio scale) is met purely through the `status` / `portfolioId` indexes on the `strategy`-schema tables.
