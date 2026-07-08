# Infrastructure — demand-intake

## Summary

`demand-intake` introduces **no new infrastructure**. It is a NestJS module inside the existing `apps/api` monolith and inherits the foundation deployment topology in full: a single shared Postgres instance with **schema-per-unit** isolation, GitHub Actions CI, a Docker multi-stage image, and rolling deploy. This unit adds exactly two things to that baseline — the `intake` Postgres schema (created by the `0006_intake_init` Prisma migration) and event-publish wiring for its four `demand-intake.demand.*` events at the existing in-process bus. No new cloud services, brokers, caches, or external dependencies are introduced. Unlike some units, `demand-intake` registers **no** event subscriber (D3-7), so it adds no idempotency-ledger footprint.

## Inherited From Foundation (unchanged)

- **Runtime**: single NestJS process in `apps/api`; demand-intake ships as a module within the same deployable — no separate service.
- **Database**: one shared Postgres instance; the `intake` schema sits alongside `execution`, `identity`, `strategy`, and `shared` via Prisma multi-schema. Same connection pool, credentials, and `PrismaService`.
- **CI/CD**: GitHub Actions pipeline (lint → test → integration → build); Testcontainers spins Postgres for integration tests at runtime.
- **Packaging**: existing Docker multi-stage build; no new image or build stage.
- **Release**: rolling deploy of the single `apps/api` image.
- **Cross-cutting**: EventBus, RFC7807 errors, AuthGuard/RBAC (incl. per-gate permissions), audit, pino logging — all consumed from the foundation kernel.

## Added By This Unit

| Item | What | Mechanism |
|------|------|-----------|
| `intake` Postgres schema | Six models (`DemandRequest`, `ScoringModel`, `ScoringCriterion`, `ScoreCard`, `CriterionScore`, `GateDecision`) + three enums | Prisma migration `0006_intake_init`, applied via `pnpm db:migrate`; `intake` added to the datasource `schemas` array — same migration flow as every other unit |
| Event-publish wiring | Four `demand-intake.demand.*` events (`submitted`, `approved`, `rejected`, `promoted`) published at command time | `eventBus.publish(...)` on the existing in-process `EventBus` (`foundation/events/event-bus.ts`); no new transport, no subscriber, no ledger |

## Logical Component → Infrastructure Mapping

| Logical component | Runs on / backed by |
|-------------------|---------------------|
| `DemandRequest` / `ScoringModel` / `ScoringCriterion` / `ScoreCard` / `CriterionScore` / `GateDecision` (Prisma models) | Tables in the `intake` schema on the shared Postgres; `DemandRequest` indexed on `status`, `ScoringModel` on `isActive`, `ScoringCriterion`/`GateDecision` on their FKs |
| `ScoreCalculator` (pure domain helper) | In-process CPU only; no I/O, no infra |
| Ranked-list query (US-030) | On-demand SQL over `intake`-schema tables via `PrismaService`, ordered by `weightedTotal` (stable tie-break by `submittedAt`); hits the `status` index; no materialized store |
| `StageGateService` state machine (US-031) | In-process; `GateDecision` rows persisted to `intake` schema |
| Event publications (4 events) | Existing in-process `EventBus`; the `demand.promoted` event is consumed by project-execution's existing idempotent subscriber |
| REST controllers | Existing `apps/api` HTTP server; foundation `AuthGuard` + per-gate `@RequirePermission()` |

## Explicit Statement

**No new cloud services are introduced.** No message broker, no cache, no object store, no separate database, no additional container or service. Capacity, scaling, and deployment characteristics are those of the existing `apps/api` monolith and its shared Postgres; the performance target (ranked-list query p95 < 300ms at portfolio scale) is met purely through the `status` index on the `intake`-schema tables.
