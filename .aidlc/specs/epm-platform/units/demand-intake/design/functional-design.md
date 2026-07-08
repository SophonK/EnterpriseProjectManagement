# Functional Design — demand-intake

## Summary

This document specifies the technology-agnostic business logic for the **demand-intake** unit: the demand-management domain that lets Portfolio Managers capture proposed work, lets an EPMO Director score it objectively against configurable weighted criteria, moves each request through a governed stage-gate workflow, and promotes approved demand into a project without re-keying data. It defines the domain entities (`DemandRequest`, `ScoringModel`, `ScoringCriterion`, `ScoreCard`, `CriterionScore`, `GateDecision`), their invariants and relationships, and the business rules that govern them. Each rule is traced to its originating story (US-029 through US-032).

The core domain concept is the **demand pipeline**: a request flows `submit → score → stage-gate → promote`. Submission enforces required-field validation and lands a request in `Submitted`. Scoring applies a single active versioned `ScoringModel` to compute a normalized weighted total (0–100) and a deterministic descending rank with a stable tie-break by `submittedAt`. A fixed linear stage-gate sequence (`Submitted → Screening → Evaluation → Approved`) advances only when the caller holds the per-gate permission; a request may be rejected at any active gate (terminal, with reason). Only an `Approved` request may be promoted, which publishes an event carrying the exact project-creation contract and marks the request `Promoted` (terminal). The unit is decoupled from strategy-portfolio (soft `goalId` reference only) and from project-execution (event-driven promotion, no cross-schema FK).

---

## Business-Logic Model — the demand-management domain

The unit answers four governance questions along a single directed pipeline:

1. **What work is being proposed?** — `DemandRequest` (US-029), captured by a Portfolio Manager and persisted in `Submitted`.
2. **How valuable is it, objectively?** — `ScoringModel` + `ScoringCriterion` define the weighted rubric (US-030, owned by the EPMO Director); `ScoreCard` + `CriterionScore` record a per-request evaluation and yield a normalized `weightedTotal` and a comparative `rank`.
3. **Is it governed and approved?** — `GateDecision` records each forward advance or rejection as the request moves through the fixed linear stage-gate (US-031).
4. **Does approved demand become a project?** — promotion publishes the project-creation contract and links back via `sourceDemandId` (US-032).

Pipeline (D3-4, D3-5):

```
submit ──▶ Submitted ──advance──▶ Screening ──advance──▶ Evaluation ──advance──▶ Approved ──promote──▶ Promoted
                │                     │                      │                                          (terminal)
                └──reject──▶ Rejected └──reject──▶ Rejected  └──reject──▶ Rejected
                            (terminal)            (terminal)            (terminal)
```

Bounded-context boundary (D3-1, D3-2): demand-intake never reads strategy-portfolio's or project-execution's database or API. A `strategic-fit` criterion may carry an optional **soft** `goalId` UUID reference (traceability only, not hard-validated, no runtime call into strategy-portfolio). Promotion is **event-driven**: `PromoteToProject` publishes `demand-intake.demand.promoted` with a payload matching project-execution's `DemandPromotedPayload`; project-execution creates the `Project` idempotently keyed by `sourceDemandId`. The intake form lacks portfolio and date data, so promotion accepts those parameters from the Portfolio Manager at promote time.

All persisted models live in Prisma schema `intake` (`@@schema("intake")`), multi-schema alongside `execution`, `strategy`, and `identity`.

---

## Domain Entities

### DemandRequest (Aggregate Root) — US-029

Fields: `id`, `title`, `sponsor`, `description`, `expectedValue` (Decimal, nullable), `status` (`DemandStatus`: `Submitted` | `Screening` | `Evaluation` | `Approved` | `Promoted` | `Rejected`, default `Submitted`), `currentGate` (`IntakeGate`: `Submitted` | `Screening` | `Evaluation` | `Approved` — current pipeline position), `rejectionReason` (nullable), `submittedBy` (userId), `submittedAt` (DateTime), `promotedProjectId` (UUID, nullable — set best-effort, not required), `createdAt`, `updatedAt`. Indexed `@@index([status])`.

**Invariants**:
1. `title`, `sponsor`, and `description` are all required and non-empty — a submit with any missing required field is rejected (`DEMAND_001`) and nothing is written (US-029 AC-2). `expectedValue` is optional.
2. On successful submit, `status` and `currentGate` are both set to `Submitted`; neither is client-supplied (US-029 AC-1).
3. `submittedBy` is set from the authenticated caller's `AuthContext.userId` and is immutable; `submittedAt` is stamped on submit.
4. `status` is a monotonic pipeline position: it advances only along the fixed linear sequence, may divert to `Rejected` from any active gate, and reaches `Promoted` only from `Approved`. `Rejected` and `Promoted` are **terminal** — no outgoing transition (D3-5, BR-206/BR-208).
5. `rejectionReason` is non-null iff `status = Rejected`. `promotedProjectId` is a soft reference (no cross-schema FK) set best-effort after promotion; its absence never blocks the pipeline.

**Relationships**: `DemandRequest` 1—1 `ScoreCard`; `DemandRequest` 1—N `GateDecision`.

### ScoringModel (Aggregate Root) — US-030

Fields: `id`, `name`, `version` (int), `isActive` (boolean, default `false`), `createdBy` (userId), `createdAt`, `updatedAt`. Indexed `@@index([isActive])`.

**Invariants**:
1. At most one `ScoringModel` has `isActive = true` at any time — configuring/activating a new version deactivates the prior active model (single active version, D3-3, BR-209).
2. `version` increments per logical model lineage; an activated version is immutable in its criteria set (re-configuration produces a new version, never edits an active one in place).
3. `createdBy` is set from the authenticated Director's `AuthContext` and is immutable. Only the EPMO Director may configure/activate models.

**Relationships**: `ScoringModel` 1—N `ScoringCriterion`.

### ScoringCriterion (Entity, child of ScoringModel) — US-030

Fields: `id`, `scoringModelId` (FK → ScoringModel), `name`, `weight` (Decimal — relative weight), `maxScore` (int, default `100`), `goalId` (UUID, nullable — optional **soft** ref for the strategic-fit criterion), `sortOrder` (int). Indexed `@@index([scoringModelId])`.

**Invariants**:
1. Every criterion belongs to exactly one parent `ScoringModel` — `scoringModelId` is a required FK.
2. `weight` is the relative contribution used by the weighted-total formula (BR-203); `maxScore` (default 100) is the upper bound for any `CriterionScore.rawScore` against this criterion.
3. `goalId` is a soft reference (no cross-schema FK), populated only for a strategic-fit criterion for traceability; it is never hard-validated and triggers no runtime call into strategy-portfolio (D3-1).

### ScoreCard (Entity, child of DemandRequest) — US-030

Fields: `id`, `demandRequestId` (FK → DemandRequest, **unique**), `scoringModelId` (UUID — soft ref to the model version used), `weightedTotal` (Decimal, computed 0–100), `scoredBy` (userId), `scoredAt` (DateTime), `createdAt`, `updatedAt`. Uniqueness `@@unique([demandRequestId])`.

**Invariants**:
1. At most one `ScoreCard` per `DemandRequest` (`@@unique([demandRequestId])`) — re-scoring **upserts** the single card, it never creates a second (D3-3).
2. `weightedTotal` is a derived value in `[0, 100]`, computed by `ScoreCalculator.computeWeightedTotal` from the criteria weights and `CriterionScore` raw scores (BR-203); it is never client-supplied.
3. A request is scoreable only while `status ∈ {Screening, Evaluation}` (Scored/re-scored during evaluation; D3-5). `scoringModelId` records which active model version produced the card.

**Relationships**: `ScoreCard` 1—N `CriterionScore`; `ScoreCard` N—1 `DemandRequest` (1:1 via unique).

### CriterionScore (Entity, child of ScoreCard) — US-030

Fields: `id`, `scoreCardId` (FK → ScoreCard), `criterionId` (UUID — ref to `ScoringCriterion`), `rawScore` (int), `createdAt`. Uniqueness `@@unique([scoreCardId, criterionId])`.

**Invariants**:
1. At most one row per `(scoreCardId, criterionId)` pair (`@@unique`) — one raw score per criterion per card; re-scoring a criterion updates the existing row.
2. `rawScore` is an integer in `[0, maxScore]` of the referenced criterion — an out-of-range score is rejected on scoring.
3. `rawScore` for the `strategic-fit` criterion is entered **manually** by the scorer (D3-1) — it is never auto-derived from strategy-portfolio.

### GateDecision (Entity, child of DemandRequest) — US-031

Fields: `id`, `demandRequestId` (FK → DemandRequest), `fromGate` (`IntakeGate`), `toGate` (`IntakeGate`, nullable — null on reject), `decision` (`GateOutcome`: `Advanced` | `Rejected`), `reason` (nullable), `decidedBy` (userId), `decidedAt` (DateTime). Indexed `@@index([demandRequestId])`.

**Invariants**:
1. Every gate transition (advance or reject) writes exactly one `GateDecision` row — the decision log is append-only and complete (audit of the pipeline).
2. `decision = Advanced` implies `toGate` is the single legal successor of `fromGate` in the fixed linear sequence and `reason` may be null. `decision = Rejected` implies `toGate` is null and `reason` is non-null (BR-206).
3. `decidedBy` is the authenticated caller who held the per-gate permission at decision time (BR-205); `fromGate` equals the request's `currentGate` immediately before the decision.

**Relationships**: `GateDecision` N—1 `DemandRequest`.

Enums: `DemandStatus`, `IntakeGate`, `GateOutcome`. Intra-schema relations: `ScoringModel` 1—N `ScoringCriterion`; `DemandRequest` 1—1 `ScoreCard`; `ScoreCard` 1—N `CriterionScore`; `DemandRequest` 1—N `GateDecision`. Soft refs (`goalId`, `scoringModelId` on `ScoreCard`, `promotedProjectId`) carry no cross-schema FK.

---

## Business Rules

### BR-201: Intake Required-Field Validation — US-029
A `DemandRequest` is persisted only when `title`, `sponsor`, and `description` are all present and non-empty. A missing required field rejects the submission with `DEMAND_001` (field highlighted) and nothing is written. `expectedValue` is optional. On success the request is persisted with `status = Submitted` and `currentGate = Submitted`, `demand-intake.demand.submitted` is published, and the mutation is audited. *(US-029 AC-1, AC-2)*

### BR-202: Submitter Identity from Context — US-029
On `submitIntake`, `submittedBy` is assigned from the authenticated caller's `AuthContext.userId` and `submittedAt` is stamped by the system. Neither is client-supplied, and `submittedBy` is immutable. `submittedBy` is the record-scoping key for Portfolio Manager reads over their own submissions (BR-210). *(US-029 AC-1)*

### BR-203: Weighted-Total Computation — US-030
`ScoreCalculator.computeWeightedTotal(criteria[], scores[])` returns a value in `[0, 100]` defined as the weight-normalized weighted sum of per-criterion normalized scores:

`weightedTotal = ( Σᵢ ( weightᵢ × ( rawScoreᵢ / maxScoreᵢ ) ) / Σᵢ weightᵢ ) × 100`

Each criterion's `rawScore` is normalized to `[0, 1]` by its own `maxScore`, weighted by `weightᵢ`, summed, divided by the total weight, and scaled to `[0, 100]`. When `Σ weight = 0` (or no criteria) the result is **defined** as `0` (guarded), never `NaN`. The function is **pure** (no I/O) and is the PBT P1 target. The computed value is upserted onto the request's single `ScoreCard`. *(US-030 AC-1, AC-2; D3-3)*

### BR-204: Deterministic Ranking with Stable Tie-Break — US-030
`ScoreCalculator.rank(requests[])` orders scored requests by `weightedTotal` **descending**; ties are broken by `submittedAt` **ascending** (earlier submission ranks higher). The resulting order is a **total order** (antisymmetric and transitive) and is **permutation-invariant**: any input ordering of the same set yields the identical rank assignment. Two distinct requests receive equal rank only if both `weightedTotal` and `submittedAt` are equal. `rank` is a pure function and is the PBT P2 target. *(US-030 AC-2; D3-3)*

### BR-205: Per-Gate RBAC on Advance — US-031
`advanceGate` moves a request to the next gate only if the caller holds the permission mapped to the target gate (`intake-gate:screening`, `intake-gate:evaluation`, `intake-gate:approval`). A caller lacking the per-gate permission is rejected (authorization error) and no transition or `GateDecision` is written. On authorized advance, a `GateDecision {decision: Advanced, fromGate, toGate}` is recorded and the mutation is audited. *(US-031 AC-1)*

### BR-206: Fixed Linear Stage-Gate Transitions — US-031
The stage-gate is a fixed forward-only linear sequence `Submitted → Screening → Evaluation → Approved`. `advanceGate` succeeds only for the single legal successor of the request's `currentGate`; it advances `currentGate` and mirrors `status` accordingly, and the final advance into `Approved` sets `status = Approved` and publishes `demand-intake.demand.approved`. Any advance that is not the legal forward step (skip, backward, or from a terminal state) throws `DEMAND_*` and does not mutate state. Transition validity is the PBT P3 target. *(US-031 AC-2; D3-4)*

### BR-207: Rejection is Terminal with Reason — US-031
`rejectGate` may be invoked at any **active** gate (`Submitted`, `Screening`, `Evaluation`). It requires a non-empty `reason`, sets `status = Rejected`, stores `rejectionReason`, records a `GateDecision {decision: Rejected, toGate: null, reason}`, publishes `demand-intake.demand.rejected {demandId, reason}`, and audits the mutation. `Rejected` is **terminal** — no subsequent advance, reject, or promote succeeds. *(US-031 AC-2; D3-4, D3-5)*

### BR-208: Promotion Requires Approval and Supplies Project Data — US-032
`promoteToProject` succeeds only when `status = Approved`. The Portfolio Manager supplies promotion parameters `{portfolioId, plannedStart, plannedEnd, plannedBudget?, programId?}`; `name` defaults from the intake `title`. It publishes `demand-intake.demand.promoted` with the payload **exactly** `{demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget?}` (matching project-execution's `DemandPromotedPayload`), sets `status = Promoted`, best-effort records `promotedProjectId` (`sourceDemandId` traceability), and audits. The publish is **safe to retry** — project-execution dedupes project creation by `sourceDemandId`. `Promoted` is **terminal**. A promote attempt on a non-`Approved` request throws `DEMAND_*` and does not mutate. *(US-032 AC-1, AC-2; D3-2)*

### BR-209: Single Active Scoring Model Version — US-030
At most one `ScoringModel` is active (`isActive = true`) at any time. `configureScoring` (EPMO Director only) creates a new versioned model with its weighted criteria and activates it, atomically deactivating the previously active model. Scoring always resolves criteria from the current active model, and each `ScoreCard` records the `scoringModelId` version it was computed against. *(US-030 AC-1; D3-3)*

### BR-210: Record Scoping & RBAC — US-029..US-032
- **EPMO Director**: configure/activate scoring models, score requests, view all requests.
- **Portfolio Manager**: submit intake, score, advance/reject gates (per-gate permission, BR-205), promote; record-scoped to own submissions (`submittedBy = ctx.userId`) where applicable.
All mutations (submit, score, advance, reject, promote) are audit-logged via foundation audit; inputs are Zod-validated; no PII beyond userIds is stored. *(security-baseline)*

---

## Score-Calculation Logic

```
computeWeightedTotal(criteria[], scores[]):
  scoreByCriterion = index scores by criterionId
  totalWeight = Σ criteria.weight
  IF totalWeight == 0 OR criteria is empty:            // BR-203 guard
    RETURN 0                                            // defined, never NaN
  weighted = 0
  FOR c IN criteria:
    raw   = scoreByCriterion[c.id].rawScore ?? 0        // 0..c.maxScore
    norm  = raw / c.maxScore                             // normalize to [0,1]
    weighted += c.weight × norm
  RETURN (weighted / totalWeight) × 100                  // in [0,100]
```

```
rank(requests[]):                                        // BR-204
  ordered = requests.sortedBy(
    r => r.weightedTotal   DESC,                          // primary: higher score first
    r => r.submittedAt     ASC)                           // stable tie-break: earlier first
  RETURN ordered with rank = index + 1
```

Both functions are **pure** and **deterministic**: for a fixed input they always return the same result with no I/O — the primary PBT surface (P1, P2).

---

## Stage-Gate State-Machine Logic

```
GATES        = [Submitted, Screening, Evaluation, Approved]   // fixed linear order
ACTIVE_GATES = [Submitted, Screening, Evaluation]             // rejectable
TERMINAL     = [Promoted, Rejected]                            // no outgoing transition

advanceGate(request, ctx):                                     // BR-205, BR-206
  IF request.status IN TERMINAL: throw DEMAND_*                // terminal: no advance
  next = successor of request.currentGate in GATES
  IF next is undefined: throw DEMAND_*                         // already at Approved
  IF NOT ctx.hasPermission(gatePermission[next]): throw AuthError   // per-gate RBAC
  record GateDecision { fromGate: currentGate, toGate: next, decision: Advanced }
  currentGate = next ; status = next
  IF next == Approved: publish demand-intake.demand.approved { demandId }
  audit

rejectGate(request, reason, ctx):                              // BR-207
  IF request.status NOT IN ACTIVE_GATES-status: throw DEMAND_* // only from active gate
  require reason non-empty
  record GateDecision { fromGate: currentGate, toGate: null, decision: Rejected, reason }
  status = Rejected ; rejectionReason = reason
  publish demand-intake.demand.rejected { demandId, reason } ; audit
```

Only the single legal forward transition succeeds; any illegal advance or a transition out of a terminal state throws `DEMAND_*` and leaves state unchanged — the PBT P3 target.
