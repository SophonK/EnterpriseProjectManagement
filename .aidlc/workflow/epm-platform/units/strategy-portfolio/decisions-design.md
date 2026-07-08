# Design Decisions (D3) — Unit: strategy-portfolio

## Context Summary
- **Unit**: strategy-portfolio (domain) · owner: Sophon · schema `strategy`
- **Stories**: US-006 (define goals/OKRs), US-007 (portfolios), US-008 (link project↔goal), US-009 (investment-mix view), US-010 (surface unaligned work), US-011 (programs)
- **Inherited from foundation.md (SETTLED — not re-asked)**: NestJS · Prisma (schema per unit) · Zod · in-process module APIs + domain events · RFC 7807 · @epm/shared · OAuth2/OIDC + RBAC + record-scoping
- **Depends on**: identity-access (authz/RBAC — via foundation, BUILT), project-execution (Project data for alignment & investment-mix — BUILT; it stores `portfolioId`/`programId` as soft UUID refs and publishes `project-execution.project.created`/`.status.changed`)
- **Extensions (blocking)**: security-baseline, resiliency-baseline, property-based-testing (partial)

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"**.

---

## Decision Questions

### D3-1: Cross-unit read of Project data (investment-mix & unaligned work seam)
**Question**: US-009 (investment-mix) and US-010 (unaligned work) need Project data (status, planned-budget, portfolio link) that lives in `project-execution`. How does `strategy-portfolio` obtain it?
- 1) **Local read-model — subscribe to `project-execution.project.created`/`.status.changed` and maintain a lightweight `ProjectAlignmentView` projection in the `strategy` schema (projectId, status, plannedBudget, portfolioId); aggregate/alignment queries run against the local projection** **(Recommended — decouples units, fast reads, resilient if execution is busy; fits event-driven foundation)**
- 2) Synchronous pull — call `project-execution` module API on demand for every investment-mix / alignment query (no local copy)
- 3) Hard cross-schema join across `strategy` and `execution` schemas
- 4) Other (please specify): _______

**Answer**: 

---

### D3-2: Where the Project↔Goal link (GoalLink) is stored
**Question**: US-008 links a Project to one or more StrategicGoals. Which schema owns the `GoalLink` records?
- 1) **`strategy` schema owns `GoalLink` (goalId FK within `strategy` + `projectId` as soft UUID ref to `execution`); linking is a strategy-alignment concern, project-execution stays unaware of goals** **(Recommended — matches units.md domain model; GoalLink listed under strategy-portfolio)**
- 2) `execution` schema stores goal ids on the Project row
- 3) A new shared join table outside both schemas
- 4) Other (please specify): _______

**Answer**: 

---

### D3-3: Portfolio ↔ StrategicGoal association cardinality
**Question**: US-007 AC2 allows associating one or more strategic goals with a portfolio. How is this modeled?
- 1) **Many-to-many via a `PortfolioGoal` join entity in the `strategy` schema (a portfolio targets N goals; a goal spans N portfolios)** **(Recommended — reflects real EPMO governance)**
- 2) One-to-many (a portfolio has many goals, a goal belongs to one portfolio)
- 3) Single goal per portfolio
- 4) Other (please specify): _______

**Answer**: 

---

### D3-4: Alignment status determination & "unaligned" flagging (US-008 AC2, US-010)
**Question**: A project activated with no linked goal is "unaligned" and must be surfaced. Where/how is alignment evaluated and the `ProjectFlaggedUnaligned` event raised?
- 1) **strategy-portfolio evaluates alignment: on `project.status.changed`→active (or `.created`), check for any GoalLink for that projectId; if none, mark the local view `unaligned` and publish `strategy-portfolio.project.flagged-unaligned`. US-010 report reads the local projection (status=active AND no GoalLink)** **(Recommended — alignment is this unit's responsibility; execution stays decoupled)**
- 2) project-execution decides alignment and calls into strategy-portfolio
- 3) Compute alignment lazily only when the US-010 report is opened (no event, no flag persisted)
- 4) Other (please specify): _______

**Answer**: 

---

### D3-5: Investment-mix aggregation strategy (US-009)
**Question**: The investment-mix view groups project count & planned-budget by strategic goal and by portfolio. How is it computed?
- 1) **On-demand aggregation query over the local `ProjectAlignmentView` + GoalLink + Portfolio tables (grouped counts/sum), computed at read time — no separate materialized store for MVP** **(Recommended — data volume is portfolio-scale, not big-data; keeps it simple, always fresh)**
- 2) Materialized/cached investment-mix rollup updated on each project event
- 3) Delegate aggregation to reporting-dashboards (defer US-009 compute there)
- 4) Other (please specify): _______

**Answer**: 

---

### D3-6: Hierarchy integrity — Program under Portfolio (US-011)
**Question**: Programs live under portfolios and projects assign to programs. How is the Portfolio→Program→Project hierarchy enforced here?
- 1) **`Program` has a required `portfolioId` FK within `strategy`; Project→Program assignment is a soft UUID ref validated via strategy-portfolio's module API when project-execution assigns it (Program is the aggregate boundary, Portfolio is the parent)** **(Recommended — consistent with the soft-ref seam pattern from project-execution D3-1)**
- 2) Program is a value object nested inside Portfolio (no independent aggregate)
- 3) Arbitrary nesting (programs under programs)
- 4) Other (please specify): _______

**Answer**: 

---

### D3-7: Correctness & Property-Based Testing (MANDATORY — pbt=partial/blocking)
**Question**: Which properties should carry PBT for this unit?
- 1) **Yes — (a) investment-mix aggregation is total-preserving (sum of per-group budgets = sum over all in-scope projects; counts partition without loss/double-count), (b) alignment determination is exhaustive (a project is aligned iff ≥1 GoalLink exists — no third state), (c) portfolio-goal M:N link set operations are idempotent (re-linking same pair is a no-op)** **(Recommended)**
- 2) Yes — investment-mix aggregation only
- 3) No PBT in this unit (defer)
- 4) Other (please specify): _______

**Answer**: 

---

### D3-8: Domain events published & subscribed
**Question**: Confirm this unit's event contract (consumed by demand-intake, reporting-dashboards)?
- 1) **Publishes `strategy-portfolio.portfolio.created`, `.program.created`, `.project.linked-to-goal`, `.project.flagged-unaligned`; Subscribes `project-execution.project.created` and `project-execution.status.changed` (to maintain the alignment projection)** **(Recommended — matches units.md; adds status.changed subscription needed for D3-1/D3-4)**
- 2) Minimal — publish only `.project.flagged-unaligned`
- 3) Other (please specify): _______

**Answer**: 

---

## Decisions Summary
<!-- Filled via "use recommendations" — option 1 (recommended) for all. -->
- D3-1 Project data read: **Local read-model** — subscribe to `project-execution.project.created`/`.status.changed`, maintain `ProjectAlignmentView` projection in `strategy` schema; aggregate/alignment reads run against the projection.
- D3-2 GoalLink ownership: **`strategy` schema owns `GoalLink`** (goalId FK within `strategy`, `projectId` soft UUID ref to `execution`).
- D3-3 Portfolio↔Goal cardinality: **Many-to-many** via `PortfolioGoal` join entity.
- D3-4 Alignment/unaligned flagging: **strategy-portfolio evaluates** on `project.created`/`.status.changed`→active; no GoalLink → mark view `unaligned` + publish `strategy-portfolio.project.flagged-unaligned`; US-010 reads projection (active AND no GoalLink).
- D3-5 Investment-mix aggregation: **On-demand aggregation query** over local `ProjectAlignmentView` + GoalLink + Portfolio (grouped count/sum), computed at read time; no materialized store for MVP.
- D3-6 Program hierarchy: **`Program` has required `portfolioId` FK** in `strategy`; Project→Program is soft UUID ref validated via strategy-portfolio module API.
- D3-7 PBT: **Yes** — (a) investment-mix aggregation total-preserving (group sums = total, counts partition without loss/double-count), (b) alignment determination exhaustive (aligned iff ≥1 GoalLink), (c) portfolio-goal M:N link operations idempotent.
- D3-8 Events: **Publishes** `strategy-portfolio.portfolio.created`, `.program.created`, `.project.linked-to-goal`, `.project.flagged-unaligned`; **Subscribes** `project-execution.project.created`, `project-execution.status.changed`.

## Validation Notes
- **Foundation consistency**: all D3 choices honor foundation.md (NestJS, Prisma schema-per-unit `strategy`, Zod, in-process module APIs + domain events, RFC 7807, RBAC + record-scoping). No stack re-decisions. ✅
- **Cross-unit consistency**: soft-ref seam (D3-1/D3-2/D3-6) mirrors project-execution D3-1 (soft `portfolioId`/`programId`, no cross-schema FK). Subscribes to events project-execution already publishes. ✅
- **Extension gates**: security-baseline (RBAC/record-scoping on portfolios/programs/goals — nfr), resiliency-baseline (event-subscription retry/idempotent projection — nfr-design), PBT partial (D3-7 properties). All addressed in design. ✅
- No conflicts detected. Validation clean.

---

**Answers**: filled via "use recommendations" (option 1 for D3-1…D3-8). Validated clean. Proceeding to expanded design generation in autonomous mode.
