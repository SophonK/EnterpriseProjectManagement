# Functional Design — strategy-portfolio

## Summary

This document specifies the technology-agnostic business logic for the **strategy-portfolio** unit: the strategic-alignment domain that lets an EPMO Director define what the organization is trying to achieve, and lets Portfolio Managers group and align delivery work to it. It defines the domain entities (`StrategicGoal`, `Portfolio`, `Program`, `PortfolioGoal`, `GoalLink`, `ProjectAlignmentView`), their invariants and relationships, and the business rules that govern them. Each rule is traced to its originating story (US-006 through US-011).

The core domain concept is **alignment**: a project is *aligned* if and only if it is linked to at least one strategic goal. The unit does not own project data — it maintains a **local read-model projection** (`ProjectAlignmentView`) fed by subscribing to `project-execution` events, and evaluates alignment against locally-owned `GoalLink` rows. Portfolios group programs and are associated many-to-many with strategic goals; programs live within exactly one portfolio. The investment-mix view aggregates planned budget and project counts on demand across the projection.

---

## Business-Logic Model — the strategic-alignment domain

The unit answers three governance questions:

1. **What are we trying to achieve?** — `StrategicGoal` (US-006), owned by the EPMO Director.
2. **How is work grouped for governance?** — `Portfolio` and `Program` (US-007, US-011), owned by Portfolio Managers.
3. **Does the work serve the strategy?** — `GoalLink` establishes alignment (US-008); `ProjectAlignmentView` is the projection over which alignment (US-010) and investment-mix (US-009) are computed.

Bounded-context boundary (D3-1, D3-2, D3-6): strategy-portfolio never reads execution's database or API for aggregation. It owns `GoalLink` (with a **soft** `projectId` UUID reference, no cross-schema FK) and a `ProjectAlignmentView` projection kept current by an event subscriber. Program membership on a project is a soft reference validated by execution *calling into* this unit's module-API (`programExists`).

All persisted models live in Prisma schema `strategy` (`@@schema("strategy")`), multi-schema alongside `execution` and `identity`.

---

## Domain Entities

### StrategicGoal (Aggregate Root) — US-006

Fields: `id`, `title`, `description`, `measure` (the target/measure), `status` (`GoalStatus`: `Active` | `Archived`, default `Active`), `createdBy` (userId), `createdAt`, `updatedAt`.

**Invariants**:
1. `title`, `description`, and `measure` are all required and non-empty — a save with any missing required field is rejected (US-006 AC-2).
2. `status` defaults to `Active` on creation; only an `Active` goal is offered for linking/association. Archiving is a soft state change (`Active → Archived`), never a hard delete — existing `GoalLink` / `PortfolioGoal` rows are preserved for audit and historical alignment.
3. `createdBy` is set from the authenticated Director's `AuthContext` and is immutable.

**Relationships**: `StrategicGoal` 1—N `GoalLink`; `StrategicGoal` N—M `Portfolio` via `PortfolioGoal`.

### Portfolio (Aggregate Root) — US-007

Fields: `id`, `name`, `description` (nullable), `ownerId` (userId), `status` (`PortfolioStatus`: `Active` | `Archived`, default `Active`), `createdAt`, `updatedAt`.

**Invariants**:
1. `name` is required. `ownerId` is set to the **creating** user — the creator is always the owner (US-007 AC-1); `ownerId` is not a client-supplied field.
2. `ownerId` is the record-scoping key: non-Director callers may read/manage only portfolios they own (BR-107).
3. A portfolio may be associated with zero or more strategic goals through `PortfolioGoal`; association is additive and idempotent (US-007 AC-2).

**Relationships**: `Portfolio` 1—N `Program`; `Portfolio` N—M `StrategicGoal` via `PortfolioGoal`.

### Program (Entity, child of Portfolio) — US-011

Fields: `id`, `portfolioId` (FK → Portfolio, **required**), `name`, `description` (nullable), `status` (`ProgramStatus`: `Active` | `Archived`, default `Active`), `createdAt`, `updatedAt`. Indexed `@@index([portfolioId])`.

**Invariants**:
1. Every program belongs to exactly one parent portfolio — `portfolioId` is a required FK and cannot be null (US-011 AC-1). A program cannot exist without a parent portfolio.
2. `portfolioId` is immutable after creation (a program is not re-parented; it is archived and recreated if needed).
3. A program's roll-up is the set of projection rows whose `programId` equals this program's `id` (US-011 AC-2); membership is derived from the projection, not stored on `Program`.

### PortfolioGoal (M:N Join, Portfolio ↔ StrategicGoal) — US-007

Fields: `id`, `portfolioId` (FK → Portfolio), `goalId` (FK → StrategicGoal), `createdAt`. Uniqueness `@@unique([portfolioId, goalId])`.

**Invariants**:
1. At most one row per `(portfolioId, goalId)` pair — the join has **set semantics**. Associating an already-associated goal is a no-op, not a duplicate and not an error (US-007 AC-2, D3-3).
2. Both endpoints must exist and be resolvable at association time (`goalId` → an existing `StrategicGoal`).

### GoalLink (Project ↔ Goal) — US-008

Fields: `id`, `goalId` (FK → StrategicGoal), `projectId` (UUID, **soft** ref to `execution.Project`, no FK), `linkedBy` (userId), `createdAt`. Uniqueness `@@unique([goalId, projectId])`, indexed `@@index([projectId])`.

**Invariants**:
1. At most one row per `(goalId, projectId)` pair — **set semantics** (D3-2). Re-linking the same project/goal pair is idempotent (no duplicate row, no error).
2. `projectId` is a soft reference — its existence is not FK-enforced. The link may be created against a `projectId` known only through the projection.
3. The *existence of ≥1 `GoalLink` for a `projectId`* is the sole determinant of that project's alignment (see BR-103).

**Relationships**: `GoalLink` N—1 `StrategicGoal`; `GoalLink` references a project by soft UUID.

### ProjectAlignmentView (Read-Model Projection) — US-008/US-009/US-010

Fields: `projectId` (UUID, **PK**, soft ref), `name`, `status` (string mirroring execution status, e.g. `Open`/`Active`/`Completed`/`Cancelled`), `plannedBudget` (Decimal, nullable), `portfolioId` (UUID, nullable soft ref), `programId` (UUID, nullable soft ref), `aligned` (boolean, default `false`), `lastEventAt` (DateTime), `updatedAt`. Indexed `@@index([status])`, `@@index([portfolioId])`.

**Invariants**:
1. Not a true domain aggregate — a materialized projection maintained solely by `ProjectAlignmentProjector` in response to `project-execution` events (D3-1). It is never mutated by direct user commands except for the derived `aligned` flag written by `AlignmentService`.
2. Exactly one row per `projectId` (PK). The projector **upserts** by `projectId` — duplicate or out-of-order events must not create duplicate rows.
3. `lastEventAt` monotonicity guard: an incoming event whose timestamp is not newer than the stored `lastEventAt` is ignored for field updates (tolerates out-of-order/duplicate delivery; D3-1, resiliency-baseline).
4. `aligned` is a **derived** flag, never client-supplied: it equals `(GoalLink count for projectId ≥ 1)` as of the last alignment evaluation (BR-103).

---

## Business Rules

### BR-101: Strategic Goal Required Fields — US-006
A `StrategicGoal` is persisted only when `title`, `description`, and `measure` are all present and non-empty. A missing required field rejects the save (validation error, field highlighted) and nothing is written. *(US-006 AC-2)*

### BR-102: Portfolio Owner = Creator — US-007
On `createPortfolio`, `ownerId` is assigned from the authenticated caller's `AuthContext.userId`. The client cannot set or override the owner. The creator is therefore always the owner. *(US-007 AC-1)*

### BR-103: Alignment Iff ≥1 GoalLink — US-008/US-010
A project is **aligned** if and only if there exists at least one `GoalLink` for its `projectId`.
`AlignmentStatus = Aligned iff (COUNT(GoalLink WHERE projectId = p) ≥ 1), else Unaligned.`
`evaluateAlignment(projectId)` is a total boolean function over this count — there is no third state and no null. The `ProjectAlignmentView.aligned` flag is set to this value on every recompute. *(US-008 AC-2, US-010 AC-1; D3-4)*

### BR-104: Activating an Unaligned Project Flags It — US-008
When a project transitions to `Active` (observed via `project-execution.status.changed`) or is created active, `AlignmentService.evaluateAlignment` runs. If the project has no `GoalLink`, the projection's `aligned` is set to `false` and `strategy-portfolio.project.flagged-unaligned` is published to warn the owner. If ≥1 link exists, `aligned` is set to `true` and no flag is raised. *(US-008 AC-2; D3-4)*

### BR-105: Program Requires a Parent Portfolio — US-011
A `Program` can only be created within an existing portfolio; `portfolioId` is a required, immutable FK. `createProgram` rejects if the parent portfolio does not exist. Projects assigned to a program (soft `programId` on the projection) roll up under that program. *(US-011 AC-1, AC-2)*

### BR-106: PortfolioGoal M:N Set Semantics — US-007
`associateGoals(portfolioId, goalIds[])` upserts one `PortfolioGoal` row per `(portfolioId, goalId)` pair guarded by `@@unique([portfolioId, goalId])`. Re-associating an existing goal is a no-op (idempotent); the operation is additive and never produces duplicate rows or errors. A portfolio may carry many goals; a goal may belong to many portfolios. *(US-007 AC-2; D3-3)*

### BR-107: GoalLink Set Semantics & Idempotent Linking — US-008
`linkProjectToGoals(projectId, goalIds[], linkedBy)` upserts one `GoalLink` per `(goalId, projectId)` pair guarded by `@@unique([goalId, projectId])`. Applying the same pair twice yields the same single row — no duplicate, no error. After linking, alignment for `projectId` is recomputed and the projection updated; `strategy-portfolio.project.linked-to-goal` is published. *(US-008 AC-1; D3-2)*

### BR-108: Investment-Mix Grouping Semantics — US-009
`getInvestmentMix(groupBy)` produces `InvestmentSummary[]` = `{ groupingType, groupId, groupName, projectCount, totalPlannedBudget }` computed on demand over `ProjectAlignmentView` (joined with `GoalLink` and `Portfolio`); no materialized store (D3-5).
- **groupBy = 'portfolio'**: in-scope projection rows are **partitioned** by `portfolioId`. Each project belongs to exactly one portfolio group (or an "unassigned" group when `portfolioId` is null), so `SUM(group.projectCount) = |in-scope projects|` and `SUM(group.totalPlannedBudget) = SUM(in-scope plannedBudget)` exactly (see P1).
- **groupBy = 'goal'**: rows are grouped through `GoalLink`. A project linked to **N** goals contributes to **N** goal-groups by design (link expansion) — the goal dimension is a covering multiset, not a partition. Totals therefore equal the sum over the *link-expanded* set (each `(project, goal)` link counted once), which is the correct strategic-investment reading. *(US-009 AC-1, AC-2; D1-6 planned-budget)*
`plannedBudget` is nullable; a null contributes 0 to `totalPlannedBudget` and still counts toward `projectCount`.

### BR-109: Surface Unaligned Work — US-010
`listUnaligned()` returns projection rows where `status = 'Active' AND aligned = false`, each with owner and portfolio (`ownerId`, `portfolioId`, `portfolioName`). If the result set is empty, the caller renders a "fully aligned" empty-state (`fullyAligned = true`); otherwise it lists the unaligned projects. Backed by `@@index([status])` and `@@index([portfolioId])`. *(US-010 AC-1, AC-2; D3-4)*

### BR-110: Record Scoping & RBAC — US-007..US-011
- **EPMO Director**: create/archive goals, view all portfolios, run the unaligned report.
- **Portfolio Manager**: create/manage portfolios (scoped to `ownerId`), programs, goal-links, investment-mix.
Non-Director reads/writes over portfolios (and their programs/goals) are filtered by `Portfolio.ownerId = ctx.userId`. All mutations are audit-logged via foundation audit; no PII beyond userIds is stored. *(security-baseline)*

### BR-111: Idempotent, Order-Tolerant Projection — US-008..US-010
`ProjectAlignmentProjector` handles `project-execution.project.created` / `.status.changed` idempotently (dedupe by `eventId` via foundation idempotency), upserts by `projectId`, and guards field writes with `lastEventAt` so duplicate or out-of-order events cannot corrupt the projection or produce duplicate rows. After each upsert it triggers `AlignmentService.evaluateAlignment` (BR-103/BR-104). *(D3-1; resiliency-baseline)*

---

## Alignment Service Logic

```
evaluateAlignment(projectId):
  linkCount = GoalLinkRepository.countByProject(projectId)   // owned by strategy schema
  aligned   = (linkCount >= 1)                               // BR-103: total boolean, no third state
  view      = ProjectAlignmentViewRepository.findByProject(projectId)
  ProjectAlignmentViewRepository.setAligned(projectId, aligned)

  IF view.status == 'Active' AND aligned == false:           // BR-104
    publish strategy-portfolio.project.flagged-unaligned { projectId, ownerId, portfolioId }
  RETURN aligned
```

`evaluateAlignment` is **idempotent** and **deterministic**: for a fixed set of `GoalLink` rows it always returns the same boolean and leaves the projection in the same state (re-running never changes the result).

---

## Investment-Mix Aggregation Logic

```
getInvestmentMix(groupBy):
  rows = ProjectAlignmentView (in-scope; record-scoped for non-Director)

  IF groupBy == 'portfolio':                                 // partition — BR-108
    groups = rows.groupBy(portfolioId)                       // null → "unassigned"
    for g in groups:
      projectCount       = COUNT(rows in g)
      totalPlannedBudget = SUM(coalesce(plannedBudget, 0))

  IF groupBy == 'goal':                                      // covering multiset — BR-108
    links = join(rows, GoalLink on projectId)                // link expansion: project×goal
    groups = links.groupBy(goalId)
    for g in groups:
      projectCount       = COUNT(distinct link rows in g)
      totalPlannedBudget = SUM(coalesce(view.plannedBudget, 0) over links in g)

  RETURN InvestmentSummary[] { groupingType: groupBy, groupId, groupName, projectCount, totalPlannedBudget }
```

Aggregation is on-demand (no materialized store, D3-5), indexed for p95 < 300ms at portfolio scale.
