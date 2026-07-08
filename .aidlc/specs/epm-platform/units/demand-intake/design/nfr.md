# NFR (Compact) — demand-intake

## Summary

Compact NFR home for the `demand-intake` unit. It states the concrete security, availability, performance, and reliability targets the code-review gate checks against. Every control below is enforced with a **foundation-provided primitive** — no new tech. Security-baseline and resiliency-baseline are BLOCKING extensions; both are fully covered here (Security + Reliability tables) and elaborated in `nfr-requirements.md` / `nfr-design.md`. Names are byte-identical to the canonical model.

## Security (security-baseline, blocking)

| Control | Implementation |
|---------|---------------|
| Authentication | JWT verified by foundation `AuthGuard` (global) via `TokenVerifier` (JWKS, issuer-pinned, fail-closed). Every `/intake/*` route requires a valid token; missing/invalid → `401` (`AppError.unauthenticated`). |
| Authorization (RBAC) | Per-handler `@RequirePermission(...)` enforced by `AuthGuard` with `RbacRegistry`; **deny-by-default** — a protected route with no declared permission is refused (`403`). Grants: **EPMO Director** → `intake:scoring-model:configure`, `intake:scoring-model:read`, `intake:request:score`, `intake:request:read`; **Portfolio Manager** → `intake:request:submit`, `intake:request:read`, `intake:request:score`, `intake:request:advance`, `intake:request:reject`, `intake:request:promote`, plus the per-gate grants `intake-gate:screening`, `intake-gate:evaluation`, `intake-gate:approval`. |
| Per-gate authorization (advance) | `POST /intake/requests/:id/advance` carries the coarse `@RequirePermission('intake:request:advance')` at the guard, then `StageGateService.advanceGate` runs a **second, fail-closed** per-gate check keyed by the *target* gate against a fixed map (`Submitted→Screening`⇒`intake-gate:screening`, `Screening→Evaluation`⇒`intake-gate:evaluation`, `Evaluation→Approved`⇒`intake-gate:approval`) via `RbacRegistry.permitted`. A caller lacking the target-gate permission → `403`; state is not mutated. |
| Record scoping | Non-Director callers are scoped to their own submissions. `DemandRequestRepository.findManyScoped(ctx)` applies `submittedBy = ctx.userId` (Portfolio Manager); EPMO Director bypasses (view all). Enforced in the **repository**, not the controller, so no list/read/ranked path can leak another manager's requests. |
| Input validation | Zod DTO schema at every controller boundary via foundation `ZodValidationPipe`; unknown fields rejected (strict), invalid/missing required → `400` RFC 7807 (`DEMAND_001`). Applies to SubmitIntake, ConfigureScoring, ScoreAndRank, AdvanceGate, reject `{reason}`, PromoteToProject. |
| Audit trail | `AuditService.record()` fired on **every mutation** — submit, score, advance, reject, promote — within the same Prisma transaction as the state change. Access denials are also audited by `AuthGuard.recordDenied` (best-effort, never turns a `403` into a `500`). |
| PII minimization | Unit persists only `userId` references (`submittedBy`, `createdBy`, `scoredBy`, `decidedBy`); no names/emails/PII. `goalId`, `promotedProjectId`, `portfolioId` are opaque UUIDs. |
| No cross-schema writes | `demand-intake` writes only its own `intake` schema. Promotion is event-driven (D3-2): it publishes `demand-intake.demand.promoted`; it never writes to execution. `goalId`/`promotedProjectId` cross-refs are soft UUIDs (no FK). |

## Availability

| Target | Approach |
|--------|----------|
| Contributes to platform 99.5% availability | No external dependencies beyond Postgres and the in-process `EventBus` (already part of infra). |
| Promotion never blocks on execution | `PromoteToProject` publishes an event (D3-2) rather than calling execution synchronously; a slow/unavailable project-execution module cannot degrade intake writes or reads. Decoupled. |
| Graceful shutdown | NestJS `enableShutdownHooks()` (foundation bootstrap); in-flight requests drain before exit. |

## Performance

| Target | Approach |
|--------|----------|
| `GET /intake/requests/ranked` p95 < 300 ms at portfolio scale | Fetch is a single indexed pass: `DemandRequest` filtered by `@@index([status])` (scored requests in Screening/Evaluation/Approved) joined to its `ScoreCard` by `@@unique([demandRequestId])`; `weightedTotal` is persisted on `ScoreCard` (computed once at score time, not per read). `ScoreCalculator.rank` applies the deterministic descending order with a stable `submittedAt` tie-break over the fetched set. |
| Scoped request list/read p95 < 300 ms | `findManyScoped` owner-scope filter is an indexed equality on `submittedBy`; `@@index([status])` supports status filters; no aggregation at query time. |
| `GET /intake/scoring-models/active` p95 < 300 ms | Single-row lookup served by `@@index([isActive])` (one active model version). |

## Reliability (resiliency-baseline, blocking)

| Concern | Implementation |
|---------|---------------|
| Retry-safe promote publish | `PromotionService.promoteToProject` publishes `demand-intake.demand.promoted` with the EXACT execution payload `{demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget?}` (D3-2). Re-delivery/re-publish is safe because **project-execution creates the Project idempotently keyed on `sourceDemandId = demandId`** (consumer-side dedupe); a duplicate never creates a second project. `demandId` is stable, so the payload is deterministic across retries. |
| Idempotent re-promote guard | `Promoted` is a **terminal** status (D3-5). A second `promote` on an already-promoted request is refused fail-closed by the status guard (`DEMAND_*`), so the operation cannot double-fire from the intake side either. |
| Guarded, atomic gate transitions | `StageGateService` is an explicit state machine over the FIXED sequence `Submitted → Screening → Evaluation → Approved` (D3-4). An illegal advance (skip, backward, or from a terminal `Rejected`/`Promoted`) throws `DEMAND_*` and **does not mutate state** (fail-closed, PBT P3). The `GateDecision` insert + `DemandRequest.status`/`currentGate` update happen inside **one Prisma transaction** — the decision record and the status change commit atomically or not at all. |
| Deterministic scoring computation | `ScoreCalculator.computeWeightedTotal` / `rank` are **pure functions** (no I/O): same criteria + scores always yield the same `weightedTotal ∈ [0,100]` and the same rank assignment (stable tie-break by `submittedAt`), guaranteed by PBT P1/P2. `Σweight = 0` is guarded (never `NaN`). |
| Fail-closed validation | Zod strict parse at the boundary rejects malformed/missing input before any state change (`DEMAND_001`); no partial write on invalid input. |
| DB error handling | Prisma exceptions caught by global `ProblemDetailsFilter`; `P2002` (unique, e.g. duplicate `ScoreCard`/`CriterionScore`) → `409`, `P2025` (not found) → `404`, else `500` — all RFC 7807, internals not leaked. |

## Observability

- Structured JSON logs (pino) with `requestId`, `userId`, and the relevant `demandId` / `scoringModelId` on all operations.
- `info` on submit/score/advance/reject/promote; `warn` on a rejected gate transition and on a per-gate authorization denial; `error` on unexpected DB failures.
