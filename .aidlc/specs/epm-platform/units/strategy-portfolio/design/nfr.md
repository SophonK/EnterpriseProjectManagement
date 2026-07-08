# NFR (Compact) — strategy-portfolio

## Summary

Compact NFR home for the `strategy-portfolio` unit. It states the concrete security, availability, performance, and reliability targets the code-review gate checks against. Every control below is enforced with a **foundation-provided primitive** — no new tech. Security-baseline and resiliency-baseline are BLOCKING extensions; both are fully covered here (Security + Reliability tables) and elaborated in `nfr-requirements.md` / `nfr-design.md`.

## Security (security-baseline, blocking)

| Control | Implementation |
|---------|---------------|
| Authentication | JWT verified by foundation `AuthGuard` (global) via `TokenVerifier` (JWKS, issuer-pinned, fail-closed). Every `/strategy/*` route requires a valid token; missing/invalid → `401` (`AppError.unauthenticated`). |
| Authorization (RBAC) | Per-handler `@RequirePermission(...)` enforced by `AuthGuard` with `RbacRegistry`; **deny-by-default** — a protected route with no declared permission is refused (`403`). Grants: **EPMO Director** → `strategy:goal:create`, `strategy:goal:archive`, `strategy:alignment:read`; **Portfolio Manager** → `strategy:portfolio:*`, `strategy:program:*`, `strategy:goal-link:*`, `strategy:investment-mix:read`. Both roles hold `strategy:goal:read`. |
| Record scoping | Non-Director callers are scoped to owned portfolios. `PortfolioRepository`/`ProgramRepository`/`InvestmentMixService` apply a `Portfolio.ownerId = ctx.userId` filter (Portfolio Manager); EPMO Director bypasses (view all). Enforced in the **repository**, not the controller, so no list/read path can leak cross-owner rows. |
| Input validation | Zod DTO schema at every controller boundary via foundation `ZodValidationPipe`; unknown fields rejected (strict), invalid → `400` RFC 7807 (`STRATEGY_001`). Applies to DefineStrategicGoal, CreatePortfolio, associateGoals, CreateProgram, LinkProjectToGoal, and `groupBy`/query params. |
| Audit trail | `AuditService.record()` fired on **every mutation** (goal create/archive, portfolio create, goal association, program create, goal-link create/delete) via the foundation `AuditInterceptor`. Access denials are also audited by `AuthGuard.recordDenied` (best-effort, never turns a `403` into a `500`). |
| PII minimization | Unit persists only `userId` references (`createdBy`, `ownerId`, `linkedBy`); no names/emails/PII. `projectId`/`portfolioId`/`programId` are opaque UUIDs. |
| No cross-schema writes | `strategy-portfolio` writes only its own `strategy` schema. Project data arrives read-only through the `ProjectAlignmentView` projection (D3-1); `projectId`/`programId` cross-refs are soft UUIDs (no FK), never written back to execution. |

## Availability

| Target | Approach |
|--------|----------|
| Contributes to platform 99.5% availability | No external dependencies beyond Postgres and the in-process EventBus (already part of infra). |
| Unaligned + investment-mix reads never block on execution | Reads hit the local `ProjectAlignmentView` projection (D3-1), never execution's DB/API — a slow/unavailable execution module cannot degrade strategy reads. |
| Graceful shutdown | NestJS `enableShutdownHooks()` (foundation bootstrap); in-flight requests drain before exit; the `OutboxRelay` tick finishes its current row before stopping. |

## Performance

| Target | Approach |
|--------|----------|
| `GET /strategy/investment-mix?groupBy=goal\|portfolio` p95 < 300 ms | On-demand aggregation (D3-5) over `ProjectAlignmentView` joined to `GoalLink`/`Portfolio`; `@@index([status])` and `@@index([portfolioId])` on the view + `@@index([projectId])` on `GoalLink` keep the grouped `COUNT` / `SUM(plannedBudget)` index-driven. |
| `GET /strategy/alignment/unaligned` p95 < 300 ms | Filter `status = 'Active' AND aligned = false` served by `@@index([status])` on `ProjectAlignmentView`; `aligned` materialized on write by the projector — no per-request GoalLink recount. |
| Scoped portfolio/program lists p95 < 300 ms | `@@index([portfolioId])` on `Program`; owner-scope filter is an indexed equality. |

## Reliability (resiliency-baseline, blocking)

| Concern | Implementation |
|---------|---------------|
| Idempotent event projection | `ProjectAlignmentProjector` (subscriber to `project-execution.project.created` / `.status.changed`) is wrapped with foundation `makeIdempotent(handlerName, ledger, …)` — dedupe by `eventId` via `PrismaIdempotencyLedger` (`shared.processed_events`), at-most-once under at-least-once delivery. |
| Out-of-order / duplicate tolerance | Projection is an **upsert keyed on `projectId`**, guarded by `lastEventAt`: an event with `occurredAt <= view.lastEventAt` is ignored, so a late/duplicate/reordered event never overwrites newer state. |
| Reliable publish | All outbound events (`portfolio.created`, `program.created`, `project.linked-to-goal`, `project.flagged-unaligned`) written via foundation `OutboxWriter.enqueue(tx, …)` inside the same Prisma transaction as the state change; `OutboxRelay` delivers post-commit. |
| Graceful degradation of soft-ref validation | `programExists(programId)` module-API validation for execution's Project→Program soft ref is fail-open with a logged `warn` if the check cannot complete, so a transient strategy-side hiccup does not hard-block execution writes (best-effort integrity, reconciled by projection). |
| DB error handling | Prisma exceptions caught by global `ProblemDetailsFilter`; `P2002` (unique) → `409`, `P2025` (not found) → `404`, else `500` — all RFC 7807. |
| Event-handler isolation | In-process bus isolates one handler's failure (logged) from siblings; a failed projection is retried on redelivery and remains safe via the idempotency ledger + `lastEventAt` guard. |

## Observability

- Structured JSON logs (pino) with `requestId`, `userId`, and the relevant `projectId` / `portfolioId` / `goalId` on all operations.
- `warn` on unaligned-active flagging and on soft-ref validation degradation; `error` on unexpected DB failures and outbox relay failures.
