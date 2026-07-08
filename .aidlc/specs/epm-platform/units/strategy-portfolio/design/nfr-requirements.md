# NFR Requirements — strategy-portfolio

## Summary

Elaborated, measurable non-functional requirements for the `strategy-portfolio` unit across scalability, performance, availability, security, reliability, maintainability, and usability. Security (SEC-SP-*) satisfies the **security-baseline** blocking extension; reliability (REL-SP-*) satisfies the **resiliency-baseline** blocking extension. A closing tech-stack-decisions section restates (and does not contradict) the foundation + locked D3 stack. IDs are referenced by `nfr-design.md` and the code-review gate.

## Security

| ID | Requirement | Measure |
|----|-------------|---------|
| SEC-SP-01 | All `/strategy/*` endpoints require a valid JWT | `401` on missing/invalid/expired token; verified by integration suite against foundation `AuthGuard` + `TokenVerifier`. |
| SEC-SP-02 | RBAC enforced per action, deny-by-default | `403` for a role lacking the handler's `@RequirePermission`. Director cannot create portfolios/goal-links; Portfolio Manager cannot create/archive goals or read the unaligned report. Grants registered in `RbacRegistry` at bootstrap; a protected route missing a permission declaration is refused. |
| SEC-SP-03 | Record-scope filter applied to all portfolio/program list & read queries | A Portfolio Manager sees only portfolios where `ownerId = ctx.userId` (and their programs); EPMO Director sees all. Integration test asserts a second manager's portfolios are absent from the first manager's list. |
| SEC-SP-04 | Audit entry written on every mutation | `audit_log` row exists after goal create/archive, portfolio create, goal association, program create, goal-link create/delete. Verified by integration test asserting the row post-mutation. |
| SEC-SP-05 | Input validated at controller boundary | Unknown fields rejected and required fields enforced by Zod (strict) via `ZodValidationPipe`; malformed body/`groupBy` → `400` RFC 7807 `STRATEGY_001`. |
| SEC-SP-06 | No PII beyond user identifiers persisted | Schema review confirms only `createdBy` / `ownerId` / `linkedBy` UUIDs; no names, emails, or free-text PII stored by the unit. |

## Reliability

| ID | Requirement | Measure |
|----|-------------|---------|
| REL-SP-01 | `ProjectAlignmentProjector` is idempotent | Re-delivering the same `eventId` produces no duplicate/incorrect `ProjectAlignmentView` state. Integration test replays `project.created` twice; ledger (`shared.processed_events`) blocks the second execution. |
| REL-SP-02 | Projection tolerates out-of-order & duplicate events | Upsert keyed on `projectId`, guarded by `lastEventAt`: an event with `occurredAt <= view.lastEventAt` is a no-op. Test delivers `status.changed` then an older `project.created`; final view reflects the newer event. |
| REL-SP-03 | Outbound events published reliably (transactional outbox) | Each publish is enqueued via `OutboxWriter.enqueue(tx, …)` in the same transaction as the state write; a crash before relay leaves the event durable and redelivered by `OutboxRelay`. Test asserts an `outbox_event` row is committed with the state change. |
| REL-SP-04 | Soft-ref validation degrades gracefully | `programExists()` used for execution's Project→Program soft ref fails open with a logged `warn` on transient failure rather than throwing, so execution writes are not hard-blocked. Test simulates a validation failure and asserts fail-open behavior. |
| REL-SP-05 | DB errors do not fail silently | Any Prisma error surfaces via `ProblemDetailsFilter` (RFC 7807); projector errors are logged at `error` and retried by the bus/outbox. `P2002` on the idempotency ledger is treated as "already processed", not an error. |
| REL-SP-06 | Module graceful shutdown | In-flight requests complete before shutdown (NestJS `enableShutdownHooks`); the outbox relay finishes its current row. Drain timeout 10 s. |

## Performance

| ID | Requirement | Measure |
|----|-------------|---------|
| PERF-SP-01 | `GET /strategy/investment-mix?groupBy=goal\|portfolio` p95 < 300 ms at portfolio scale (up to ~1 000 active projects, 50 concurrent users) | On-demand grouped `COUNT` + `SUM(plannedBudget)` (D3-5) over `ProjectAlignmentView` ⨝ `GoalLink`/`Portfolio`; served by `@@index([status])`, `@@index([portfolioId])` on the view and `@@index([projectId])` on `GoalLink`. |
| PERF-SP-02 | `GET /strategy/alignment/unaligned` p95 < 300 ms | Filter `status='Active' AND aligned=false` via `@@index([status])`; `aligned` is materialized on write by the projector — no per-request GoalLink recount. |
| PERF-SP-03 | Scoped portfolio/program lists p95 < 300 ms | Owner-scope equality + `@@index([portfolioId])` on `Program`; no aggregation at query time. |

## Availability

| ID | Requirement | Measure |
|----|-------------|---------|
| AVL-SP-01 | Contributes to overall API 99.5% availability target | No external dependencies beyond Postgres + in-process EventBus (already part of infra). |
| AVL-SP-02 | Strategy reads isolated from execution availability | Alignment/investment-mix reads hit the local `ProjectAlignmentView` projection (D3-1), never execution's DB/API; execution downtime does not degrade strategy reads. |

## Scalability

| ID | Requirement | Measure |
|----|-------------|---------|
| SCL-SP-01 | Read model scales with project count without cross-module fan-out | Aggregations run against the local projection; growth in projects adds indexed rows, not synchronous calls to execution. |
| SCL-SP-02 | Event ingestion keeps pace with execution throughput | Projector work is O(1) per event (single upsert + alignment recompute); idempotency ledger claim is a single indexed insert. |

## Maintainability

| ID | Requirement | Measure |
|----|-------------|---------|
| MNT-SP-01 | Layout mirrors `project-execution` | `controllers/ services/ repositories/ events/ __tests__/` + `strategy-portfolio.module.ts`; reviewers navigate by the established convention. |
| MNT-SP-02 | Reuse foundation primitives, no re-invention | Auth, RBAC, validation, errors, idempotency, outbox, logging are imported from `foundation/*`; no unit-local copies. |
| MNT-SP-03 | Correctness guarded by PBT | Properties P1–P3 (`correctness.md`) covered with fast-check (total-preserving investment mix, deterministic alignment, link idempotency). |

## Usability (API consumer experience)

| ID | Requirement | Measure |
|----|-------------|---------|
| USA-SP-01 | Errors are consistent and machine-readable | All errors returned as RFC 7807 `application/problem+json` with a stable `code` and `requestId` (foundation `ProblemDetailsFilter`). |
| USA-SP-02 | Unaligned report has a clear empty state | `GET /strategy/alignment/unaligned` returns `{ items: [], fullyAligned: true }` when no active project is unaligned (US-010). |
| USA-SP-03 | Mutations are safely retryable | Link/associate operations are idempotent (set semantics via `@@unique`), so client retries do not create duplicates or errors (P3). |

## Tech-Stack Decisions (restated — must not contradict foundation / D3)

These restate the locked foundation and D3 decisions for traceability; they introduce **no new technology**.

| Concern | Decision (inherited) |
|---------|---------------------|
| Runtime / framework | NestJS module at `apps/api/src/modules/strategy-portfolio/`, mirroring project-execution. |
| Persistence | Prisma over Postgres; models under **schema `strategy`** (`@@schema("strategy")`), multi-schema like execution/identity. |
| AuthN / AuthZ | Foundation `AuthGuard` (JWT via `TokenVerifier`), `@RequirePermission`, `RbacRegistry`, `AuthContext` record scopes. |
| Input validation | Foundation `ZodValidationPipe` with Zod DTO schemas (strict). |
| Errors | Foundation `ProblemDetailsFilter` → RFC 7807 (`AppError` / shared code registry). |
| Eventing | Foundation in-process `EventBus`; **outbox** (`OutboxWriter`/`OutboxRelay`) for publish; **idempotency ledger** (`makeIdempotent` / `PrismaIdempotencyLedger`) for consume. |
| Read model | Local `ProjectAlignmentView` projection in `strategy` schema (D3-1); soft UUID refs to execution, no cross-schema FK. |
| Audit | Foundation `AuditService` + `AuditInterceptor`. |
| Logging | pino (`AppLogger`) with `requestId` correlation. |
| Testing | Vitest + Supertest (integration) + fast-check (PBT) + Testcontainers (Postgres, runtime-deferred). |
