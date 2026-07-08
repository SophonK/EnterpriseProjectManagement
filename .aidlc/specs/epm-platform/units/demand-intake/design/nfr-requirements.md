# NFR Requirements — demand-intake

## Summary

Elaborated, measurable non-functional requirements for the `demand-intake` unit across scalability, performance, availability, security, reliability, maintainability, and usability. Security (SEC-DI-*) satisfies the **security-baseline** blocking extension; reliability (REL-DI-*) satisfies the **resiliency-baseline** blocking extension. A closing tech-stack-decisions section restates (and does not contradict) the foundation + locked D3 stack. IDs are referenced by `nfr-design.md` and the code-review gate.

## Security

| ID | Requirement | Measure |
|----|-------------|---------|
| SEC-DI-01 | All `/intake/*` endpoints require a valid JWT | `401` on missing/invalid/expired token; verified by integration suite against foundation `AuthGuard` + `TokenVerifier`. |
| SEC-DI-02 | RBAC enforced per action, deny-by-default | `403` for a role lacking the handler's `@RequirePermission`. Portfolio Manager cannot configure scoring models; EPMO Director cannot submit/advance/reject/promote. Grants registered in `RbacRegistry` at bootstrap; a protected route missing a permission declaration is refused. |
| SEC-DI-03 | Per-gate permission enforced on advance | `POST /intake/requests/:id/advance` requires the target-gate permission (`intake-gate:screening` / `intake-gate:evaluation` / `intake-gate:approval`) in addition to `intake:request:advance`. Integration test asserts a caller holding `advance` but not `intake-gate:approval` gets `403` on the Evaluation→Approved step and the request stays in `Evaluation`. |
| SEC-DI-04 | Record-scope filter applied to all request list/read/ranked queries | A Portfolio Manager sees only requests where `submittedBy = ctx.userId`; EPMO Director sees all. Integration test asserts a second manager's requests are absent from the first manager's list and ranked results. |
| SEC-DI-05 | Audit entry written on every mutation | An `audit_log` row exists after submit, score, advance, reject, and promote; written in the same transaction as the state change. Verified by integration test asserting the row post-mutation. |
| SEC-DI-06 | Input validated at controller boundary | Unknown fields rejected and required fields enforced by Zod (strict) via `ZodValidationPipe`; malformed body (e.g. SubmitIntake missing `title`) → `400` RFC 7807 `DEMAND_001`. |
| SEC-DI-07 | No PII beyond user identifiers persisted | Schema review confirms only `submittedBy` / `createdBy` / `scoredBy` / `decidedBy` UUIDs; no names, emails, or free-text PII stored by the unit (`sponsor` is a free-text business field, not a system identity). |

## Reliability

| ID | Requirement | Measure |
|----|-------------|---------|
| REL-DI-01 | Promote publish is safe to retry | `demand-intake.demand.promoted` re-delivery does not create a duplicate Project: project-execution creates the Project idempotently keyed on `sourceDemandId = demandId` (D3-2). Integration/contract test asserts publishing the same `demandId` twice yields exactly one project. |
| REL-DI-02 | Re-promote is a fail-closed no-op | `Promoted` is terminal (D3-5); a second `promote` on an already-promoted request throws `DEMAND_*` and does not re-publish. Test asserts the second call is refused. |
| REL-DI-03 | Gate transitions are guarded and atomic | Only legal forward transitions succeed; an illegal advance (skip/backward/from terminal) throws `DEMAND_*` with no state mutation (PBT P3). The `GateDecision` insert and `DemandRequest.status`/`currentGate` update commit in one Prisma transaction. Test asserts a failed transition leaves both unchanged. |
| REL-DI-04 | Scoring computation is deterministic | `ScoreCalculator.computeWeightedTotal` / `rank` are pure: identical inputs → identical `weightedTotal ∈ [0,100]` and identical rank order (stable `submittedAt` tie-break); `Σweight = 0` guarded, never `NaN` (PBT P1/P2). Property test with fast-check. |
| REL-DI-05 | Validation fails closed | Invalid/missing input is rejected by Zod before any persistence; no partial writes. Test submits a malformed body and asserts no `DemandRequest` row is created. |
| REL-DI-06 | DB errors do not fail silently | Any Prisma error surfaces via `ProblemDetailsFilter` (RFC 7807). `P2002` on `ScoreCard`/`CriterionScore` uniqueness → `409`; `P2025` → `404`. |
| REL-DI-07 | Module graceful shutdown | In-flight requests complete before shutdown (NestJS `enableShutdownHooks`). Drain timeout 10 s. |

## Performance

| ID | Requirement | Measure |
|----|-------------|---------|
| PERF-DI-01 | `GET /intake/requests/ranked` p95 < 300 ms at portfolio scale (up to ~1 000 requests, 50 concurrent users) | Indexed fetch: `DemandRequest` via `@@index([status])` ⨝ `ScoreCard` via `@@unique([demandRequestId])`; `weightedTotal` persisted at score time (not recomputed per read); `ScoreCalculator.rank` applies deterministic descending order + stable tie-break over the scoped set. |
| PERF-DI-02 | Scoped request list/read p95 < 300 ms | Owner-scope equality on `submittedBy` + `@@index([status])`; no query-time aggregation. |
| PERF-DI-03 | `GET /intake/scoring-models/active` p95 < 300 ms | Single active-model lookup served by `@@index([isActive])`. |

## Availability

| ID | Requirement | Measure |
|----|-------------|---------|
| AVL-DI-01 | Contributes to overall API 99.5% availability target | No external dependencies beyond Postgres + in-process `EventBus` (already part of infra). |
| AVL-DI-02 | Intake isolated from execution availability | Promotion is event-driven (D3-2); intake never calls execution synchronously, so execution downtime does not degrade intake reads or writes. |

## Scalability

| ID | Requirement | Measure |
|----|-------------|---------|
| SCL-DI-01 | Ranking scales with request count without cross-module fan-out | Ranked read runs against local `intake` tables; growth adds indexed rows, not synchronous calls to other modules. |
| SCL-DI-02 | Scoring is O(criteria) per request | `computeWeightedTotal` is linear in the number of criteria; no N+1 fan-out — `CriterionScore` rows are read in one query per `ScoreCard`. |

## Maintainability

| ID | Requirement | Measure |
|----|-------------|---------|
| MNT-DI-01 | Layout mirrors `project-execution` / `strategy-portfolio` | `controllers/ services/ repositories/ events/ __tests__/` + `demand-intake.module.ts`; reviewers navigate by the established convention. |
| MNT-DI-02 | Reuse foundation primitives, no re-invention | Auth, RBAC, validation, errors, idempotency, audit, logging imported from `foundation/*`; no unit-local copies. |
| MNT-DI-03 | Correctness guarded by PBT | Properties P1–P3 (`correctness.md`) covered with fast-check on the pure `ScoreCalculator` and the stage-gate state machine. |

## Usability (API consumer experience)

| ID | Requirement | Measure |
|----|-------------|---------|
| USA-DI-01 | Errors are consistent and machine-readable | All errors returned as RFC 7807 `application/problem+json` with a stable `code` (e.g. `DEMAND_001`) and `requestId` (foundation `ProblemDetailsFilter`). |
| USA-DI-02 | Ranked list has a clear ordering contract | `GET /intake/requests/ranked` returns items ordered by descending `weightedTotal` with a documented stable `submittedAt` tie-break, so equal scores rank predictably. |
| USA-DI-03 | Promote is safely retryable | A client retry of `promote` does not create duplicate projects (REL-DI-01) and a re-promote is a fail-closed no-op (REL-DI-02). |

## Tech-Stack Decisions (restated — must not contradict foundation / D3)

These restate the locked foundation and D3 decisions for traceability; they introduce **no new technology**.

| Concern | Decision (inherited) |
|---------|---------------------|
| Runtime / framework | NestJS module at `apps/api/src/modules/demand-intake/`, mirroring project-execution / strategy-portfolio. |
| Persistence | Prisma over Postgres; models under **schema `intake`** (`@@schema("intake")`), multi-schema like execution/strategy/identity; migration `0006_intake_init`. |
| AuthN / AuthZ | Foundation `AuthGuard` (JWT via `TokenVerifier`), `@RequirePermission`, `RbacRegistry`, `AuthContext` record scopes; per-gate check via `RbacRegistry.permitted`. |
| Input validation | Foundation `ZodValidationPipe` with strict Zod DTO schemas. |
| Errors | Foundation `ProblemDetailsFilter` → RFC 7807 (`AppError` / shared `demand-error-codes` registry, `DEMAND_001`..). |
| Eventing | Foundation in-process `EventBus` (`eventBus.publish`); publishes 4, subscribes none (D3-7). Retry safety for promote is consumer-side idempotency (`sourceDemandId`), not an outbox. |
| Scoring model | Single active versioned `ScoringModel` + weighted `ScoringCriterion`; per-request `ScoreCard`; pure `ScoreCalculator` (D3-3). |
| Stage gate | Service-layer state machine, FIXED linear sequence, per-gate RBAC (D3-4). |
| Audit | Foundation `AuditService` (transaction-aware `record`). |
| Logging | pino (`AppLogger`) with `requestId` correlation. |
| Testing | Vitest + Supertest (integration) + fast-check (PBT) + Testcontainers (Postgres, runtime-deferred). |
