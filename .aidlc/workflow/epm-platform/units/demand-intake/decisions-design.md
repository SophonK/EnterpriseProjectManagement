# Design Decisions (D3) — Unit: demand-intake

## Context Summary
- **Unit**: demand-intake (domain) · owner: Sophon · schema `intake`
- **Stories**: US-029 (submit intake), US-030 (configurable weighted scoring), US-031 (stage-gate approval), US-032 (promote to project)
- **Inherited from foundation.md (SETTLED — not re-asked)**: NestJS · Prisma (schema per unit) · Zod · in-process event bus · RFC 7807 · @epm/shared · OAuth2/OIDC + RBAC + record-scoping
- **Depends on**: identity-access (authz — BUILT), strategy-portfolio (strategic-fit — BUILT), project-execution (promote → project — BUILT; already subscribes to `demand-intake.demand.promoted` with payload `{demandId,name,portfolioId,programId?,plannedStart,plannedEnd,plannedBudget?}` and idempotency via `sourceDemandId`)
- **Extensions (blocking)**: security-baseline, resiliency-baseline, property-based-testing (partial)

> Answers filled via "use recommendations" (option 1). Autonomous mode.

---

## Decision Questions

### D3-1: Strategic-fit scoring seam (how demand-intake uses strategy goals)
- 1) **Manual per-criterion scoring (per US-030 AC2 "scores are entered for a request"). The "strategic-fit" criterion may carry an OPTIONAL `goalId` soft UUID ref (to strategy-portfolio) for traceability, stored but not hard-validated at runtime — no synchronous call into strategy-portfolio required for MVP** **(Recommended — keeps demand-intake decoupled; does NOT modify the completed strategy-portfolio unit; matches the AC where scores are entered)**
- 2) Synchronous pull of goal list from strategy-portfolio module API on every scoring action
- 3) Local read-model projection of goals fed by strategy goal events (strategy-portfolio publishes no goal events today)

**Answer**: 1

### D3-2: Promote-to-project mechanism (US-032)
- 1) **Event-driven — on final-gate approval, `PromoteToProject` publishes `demand-intake.demand.promoted` with the execution-contract payload `{demandId,name,portfolioId,programId?,plannedStart,plannedEnd,plannedBudget?}`; project-execution's existing idempotent subscriber creates the Project (`sourceDemandId=demandId`). Because the intake form lacks portfolio/dates, `PromoteToProject` accepts these promotion params (portfolioId, plannedStart, plannedEnd, plannedBudget) supplied by the PM, pre-populating name/budget from the intake. Traceability (AC2) via `sourceDemandId` on the Project** **(Recommended — reuses the already-wired seam, no re-keying)**
- 2) Synchronous cross-unit call into project-execution ProjectService
- 3) Store promotion intent; a batch job creates projects

**Answer**: 1

### D3-3: Scoring model & weighted computation (US-030)
- 1) **A single active `ScoringModel` (Director-configured, versioned) holding weighted `ScoringCriterion` rows; a per-request `ScoreCard` captures a raw score per criterion; weighted total = Σ(weightᵢ × scoreᵢ) / Σweightᵢ normalized to 0–100; ranking = descending weighted total with stable tie-break by submittedAt** **(Recommended — objective, comparable, versionable)**
- 2) Per-request ad-hoc criteria (no shared model)
- 3) Fixed hard-coded criteria (strategic-fit/value/cost/risk), non-configurable

**Answer**: 1

### D3-4: Stage-gate workflow model (US-031)
- 1) **Fixed linear gate sequence `Submitted → Screening → Evaluation → Approved` with per-gate RBAC permission check on advance; reject at any gate → status `Rejected` + reason (terminal); final gate approval → status `Approved` (eligible for promote). Enforced as a service-layer state machine; configurable gates deferred** **(Recommended — MVP governance without over-engineering)**
- 2) Fully configurable gate definitions (Director-defined stages) — deferred complexity
- 3) Single approve/reject step (no multi-gate)

**Answer**: 1

### D3-5: DemandRequest status lifecycle & scoring capture
- 1) **`DemandRequest.status`: Submitted → Screening → Evaluation → Approved → Promoted, plus Rejected (terminal from any active gate). `ScoreCard` attached once scoring is entered; a request may be scored/re-scored while in Screening/Evaluation; `Promoted` set after the DemandPromoted event is published** **(Recommended)**
- 2) Status limited to Submitted/Approved/Rejected (no intermediate gates)
- 3) Other

**Answer**: 1

### D3-6: Correctness & Property-Based Testing (MANDATORY — pbt=partial/blocking)
- 1) **Yes — (a) weighted-score computation is bounded & correct (result ∈ [min,max] of the score scale; equals hand-computed normalized weighted sum; zero total weight handled), (b) ranking is a deterministic total order (antisymmetric, transitive, stable tie-break — permuting input never changes ranks), (c) stage-gate transitions are validity-preserving (only legal transitions succeed; Rejected/Promoted are terminal; illegal advance rejected)** **(Recommended)**
- 2) Yes — weighted-score computation only
- 3) No PBT in this unit (defer)

**Answer**: 1

### D3-7: Domain events
- 1) **Publishes `demand-intake.demand.submitted`, `demand-intake.demand.approved`, `demand-intake.demand.rejected`, `demand-intake.demand.promoted` (via eventBus, matching codebase pattern). Subscribes: none required for MVP (promotion consumed by project-execution; strategic-fit is manual)** **(Recommended — matches units.md publishes; DemandPromoted contract fixed by project-execution's subscriber)**
- 2) Minimal — publish only `demand.promoted`
- 3) Other

**Answer**: 1

---

## Decisions Summary
- D3-1 Strategic-fit seam: manual per-criterion scoring; optional `goalId` soft ref (no runtime call into strategy-portfolio); decoupled.
- D3-2 Promote: event-driven `demand-intake.demand.promoted` with execution-contract payload; `PromoteToProject` accepts portfolioId + planned dates + budget from PM; traceability via `sourceDemandId`.
- D3-3 Scoring: single active versioned `ScoringModel` + weighted `ScoringCriterion`; per-request `ScoreCard`; weighted total = Σ(w×s)/Σw → 0–100; rank desc, stable tie-break by submittedAt.
- D3-4 Stage-gate: fixed linear `Submitted→Screening→Evaluation→Approved` + per-gate RBAC; reject→Rejected+reason (terminal); final approve→Approved (promotable).
- D3-5 Lifecycle: Submitted→Screening→Evaluation→Approved→Promoted (+Rejected terminal); ScoreCard captured/re-scored in active gates.
- D3-6 PBT: weighted-score bounded/correct + ranking total-order + stage-gate transition validity.
- D3-7 Events: publishes submitted/approved/rejected/promoted; subscribes none.

## Validation Notes
- **Foundation consistency**: honors NestJS/Prisma schema-per-unit `intake`/Zod/eventBus/RFC7807/RBAC. No stack re-decisions. ✅
- **Cross-unit consistency**: `demand.promoted` payload matches project-execution's `DemandPromotedPayload` EXACTLY (`{demandId,name,portfolioId,programId?,plannedStart,plannedEnd,plannedBudget?}`); idempotency via `sourceDemandId` already handled execution-side. strategic-fit soft-ref pattern mirrors strategy-portfolio/project-execution soft refs (no cross-schema FK). ✅
- **Extension gates**: security (RBAC per gate + record scoping + audit + Zod), resiliency (event publish + idempotent promote via execution-side ledger), PBT (D3-6). All addressed. ✅
- No conflicts. Validation clean.

---

**Answers**: filled via "use recommendations" (option 1). Validated clean. Proceeding to expanded design generation in autonomous mode.
