# Tasks — Unit: demand-intake

## Summary
- **Total Tasks**: 34 across 8 phases
- **Owner**: Sophon
- **Strategy**: Bottom-up (shared types → DB schema → repositories → services → controllers) · test-first for domain logic and PBT (pure `ScoreCalculator` + stage-gate state machine)
- **Testing**: Vitest + fast-check (PBT P1–P3) + Testcontainers (integration)
- **Execution Waves**: 5 waves
- **Stories**: US-029, US-030, US-031, US-032

---

- [x] 1. Shared Types (`@epm/shared`)
  - [x] 1.1 Add `DemandRequestDTO`, `ScoringModelDTO`, `ScoringCriterionDTO`, `ScoreCardDTO`, `CriterionScoreDTO`, `GateDecisionDTO`, `RankedDemandDTO` to `packages/shared/src/types/demand-intake.ts` + enums `DemandStatus`/`IntakeGate`/`GateOutcome` — M
  - [x] 1.2 Add command DTOs + Zod schemas: `SubmitIntakeCommand`, `ConfigureScoringCommand`, `ScoreRequestCommand`, `AdvanceGateCommand`, `RejectGateCommand`, `PromoteToProjectCommand` — M
  - [x] 1.3 Add error codes `DEMAND_001–007` to `packages/shared/src/errors/demand-error-codes.ts` + register — S
  - [x] 1.4 Add event payload types: `DemandSubmittedPayload`, `DemandApprovedPayload`, `DemandRejectedPayload`, `DemandPromotedPayload` (the last EXACTLY matching project-execution's contract) to `packages/shared/src/events/demand-intake-events.ts` — S

- [x] 2. Database Schema (`packages/db`)
  - [x] 2.1 Add Prisma models `DemandRequest`, `ScoringModel`, `ScoringCriterion`, `ScoreCard`, `CriterionScore`, `GateDecision` + enums to `schema.prisma` (schema: `intake`) — M
  - [x] 2.2 Migration `0006_intake_init` SQL created; apply when Postgres available — S
  - [x] 2.3 Migration integration-test assertions (schema + unique/index) added; skips gracefully without Docker — S

- [x] 3. Repositories
  - [x] 3.1 `DemandRequestRepository` — create / findByIdScoped (→DEMAND_002) / findManyScoped (record-scope by submittedBy, Director bypass) / updateStatusGate / list-for-ranking — M
  - [x] 3.2 `ScoringModelRepository` — create versioned model + criteria / activate (single active, deactivate prior) / getActiveOrThrow (→DEMAND_003) / listCriteria — M
  - [x] 3.3 `ScoreCardRepository` — upsert ScoreCard by demandRequestId (`@@unique`) + replace CriterionScores (`@@unique([scoreCardId, criterionId])`) / findByRequest — M
  - [x] 3.4 `GateDecisionRepository` — append decision / listByRequest — S
  - [x] 3.5 Repository unit tests — M

- [x] 4. Domain Services
  - [x] 4.1 `DemandRequestService` — `submitIntake()` (BR-201 required-field validation → DEMAND_001, status=Submitted, publish `demand.submitted`, audit), `getRequest()`, `listRequests()` (scoped) — M
  - [x] 4.2 `ScoringModelService` — `configureScoring()` (Director; create+activate versioned model with criteria, single active BR-209, audit), `getActiveModel()`, `listCriteria()` — M
  - [x] 4.3 `ScoreCalculator` (PURE) + `ScoringService` — `computeWeightedTotal(criteria, scores)` → 0–100 (BR-203, Σweight=0 guard), `rank(requests)` (BR-204 desc, stable tie-break); `scoreRequest()` (upsert ScoreCard, DEMAND_004 invalid score, audit), `rankRequests()` — M
  - [x] 4.4 `StageGateService` — `advanceGate()` (BR-205 per-gate RBAC, BR-206 fixed-sequence state machine → DEMAND_005 illegal, record GateDecision, publish `demand.approved` on final approve, audit), `rejectGate()` (BR-207 status=Rejected + reason, record decision, publish `demand.rejected`, audit) — M
  - [x] 4.5 `PromotionService` — `promoteToProject()` (BR-208 require status=Approved → DEMAND_006; accept {portfolioId, plannedStart, plannedEnd, plannedBudget?, programId?}; publish `demand.promoted` with EXACT execution payload; status=Promoted; audit) — M

- [x] 5. PBT & Unit Tests
  - [x] 5.1 PBT P1: weighted-score bounded & correct — result ∈ [0,100], equals hand-computed normalized weighted sum, Σweight=0 guarded (no NaN) (100 runs) — M
  - [x] 5.2 PBT P2: ranking deterministic total order — permutation-invariant, antisymmetric/transitive, stable tie-break by submittedAt (100 runs) — M
  - [x] 5.3 PBT P3: stage-gate transition validity — only legal forward transitions succeed; Rejected/Promoted terminal; illegal advance throws + no mutation (100 runs) — M

- [x] 6. Event Publisher
  - [x] 6.1 Wire the 4 `demand-intake.*` publications via `eventBus.publish` in the services (submitted/approved/rejected/promoted); confirm event-type constants valid; no subscriber (D3-7) — S
  - [x] 6.2 Publisher tests — promote publishes exact `{demandId,name,portfolioId,programId?,plannedStart,plannedEnd,plannedBudget?}`; approved/rejected payloads correct — S

- [x] 7. Controllers & Module
  - [x] 7.1 `DemandRequestController` — POST `/intake/requests` (PM), GET `/intake/requests`, GET `/:id` · `ZodValidationPipe` + `AuthGuard` + `@RequirePermission()` — S
  - [x] 7.2 `ScoringModelController` — POST `/intake/scoring-models` (Director), GET `/intake/scoring-models/active` — S
  - [x] 7.3 `ScoringController` — POST `/intake/requests/:id/score`, GET `/intake/requests/ranked` — S
  - [x] 7.4 `StageGateController` — POST `/intake/requests/:id/advance`, POST `/intake/requests/:id/reject` (PM, per-gate permission) — S
  - [x] 7.5 `PromotionController` — POST `/intake/requests/:id/promote` (PM) — S
  - [x] 7.6 `DemandIntakeModule` — register providers, RBAC grants (Director + Portfolio Manager + per-gate permissions); register in `AppModule` (after project-execution) — S

- [x] 8. Integration Tests
  - [x] 8.1 Submit intake → persisted "Submitted"; missing required field → DEMAND_001 — M
  - [x] 8.2 Configure scoring model → score request → weighted total computed + ranked — M
  - [x] 8.3 Stage-gate: advance through gates with permission; advance without gate permission → 403; illegal transition → DEMAND_005 — M
  - [x] 8.4 Reject at a gate → status Rejected + reason recorded (terminal) — S
  - [x] 8.5 Promote approved request → `demand.promoted` published with exact payload; status Promoted; re-promote is no-op (terminal) — M
  - [x] 8.6 Record-scope (PM sees only own requests) + audit rows on mutations + `GET /health` green with module registered — M

---

## Execution Waves

### Wave 1
- **Phase 1** — Shared Types — owns: `packages/shared/src/types/demand-intake.ts`, `errors/demand-error-codes.ts`, `events/demand-intake-events.ts`

### Wave 2
- **Phase 2** — Database Schema — owns: `packages/db/prisma/schema.prisma` (intake models), migration `0006_intake_init`
- _(Phase 1 first)_

### Wave 3
- **Phase 3** — Repositories — owns: `apps/api/src/modules/demand-intake/repositories/`
- _(Phase 2 first)_

### Wave 4 (parallelizable within)
- **Phase 4** — Domain Services (incl. pure `ScoreCalculator`) — owns: `services/`
- **Phase 5** — PBT & Unit Tests — owns: `__tests__/pbt.test.ts`, `__tests__/*.service.test.ts`
- _(Services + their tests/PBT develop together; ScoreCalculator + state machine are the PBT surface)_

### Wave 5 (sequential)
- **Phase 6** — Event Publisher — owns: services' publish calls, `__tests__/publisher.test.ts`
- **Phase 7** — Controllers & Module — owns: `controllers/`, `demand-intake.module.ts`, `app.module.ts`
- **Phase 8** — Integration Tests — owns: `__tests__/demand-intake.int.test.ts`
- _(Controllers depend on services; integration tests run last)_

---

## Definition of Done

- [ ] All 4 user stories (US-029…US-032) pass integration tests
- [ ] PBT properties P1–P3 green (100 runs each)
- [ ] `@epm/shared` exports new DTOs, Zod schemas, error codes (`DEMAND_001–007`), event payloads
- [ ] Migration `0006_intake_init` committed and applied (or gracefully skipped without Postgres)
- [ ] `demand.promoted` payload byte-identical to project-execution's `DemandPromotedPayload`
- [ ] All endpoints return RFC 7807 on error paths (tested)
- [ ] Per-gate RBAC enforced (advance rejected without gate permission)
- [ ] Record-scope enforcement verified (PM cannot access other PM's requests)
- [ ] Weighted-score computation bounded/correct (P1); ranking deterministic (P2); gate transitions valid-only (P3)
- [ ] Audit entries written on every mutation (submit/score/advance/reject/promote)
- [ ] `GET /health` green with `DemandIntakeModule` registered
- [ ] TypeScript strict — no `any`; ESLint + Prettier pass
- [ ] CI green (lint → test → integration → build)
