# Design Decisions (D3) — Unit: project-execution

## Context Summary
- **Unit**: project-execution (domain) · owner: Chavakorn · schema `execution`
- **Stories**: US-016 (create project), US-017 (milestones/WBS), US-018 (status & health), US-019 (roll-up)
- **Inherited from foundation.md (SETTLED — not re-asked)**: NestJS · Prisma (schema per unit) · Zod · in-process module APIs + domain events · RFC 7807 · @epm/shared · OAuth2/OIDC + RBAC
- **Depends on**: identity-access (auth/RBAC — via foundation), strategy-portfolio (project ↔ portfolio/program) — *not built yet*
- **Extensions (blocking)**: security-baseline, resiliency-baseline, property-based-testing (partial)

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"**.

---

## Decision Questions

### D3-1: Cross-unit reference to Portfolio/Program (parallel-dev seam)
**Question**: `strategy-portfolio` isn't built yet. How does a Project reference its portfolio/program?
- 1) **Soft reference — store `portfolioId`/`programId` as UUID columns in `execution` schema, no cross-schema FK; validate existence via strategy-portfolio's module API when available (Anti-Corruption Layer)** **(Recommended — unblocks parallel work)**
- 2) Hard FK across schemas (requires strategy-portfolio built first — blocks parallel work)
- 3) Defer any portfolio link until strategy-portfolio lands
- 4) Other (please specify): _______

**Answer**: 

---

### D3-2: Status Roll-up computation
**Question**: How is program/portfolio health roll-up computed (US-019)?
- 1) **Event-driven — on StatusChanged, publish event; a read-model/projection recomputes roll-up asynchronously (fits reporting-dashboards later)** **(Recommended)**
- 2) Synchronous — recompute parent roll-up inline on every status change
- 3) Scheduled batch recompute
- 4) Other (please specify): _______

**Answer**: 

---

### D3-3: Milestones vs. Work Breakdown depth
**Question**: How deep is the work structure (US-017)?
- 1) **Flat milestones + a single-level WBS item list under a project (no nested tree)** **(Recommended — MVP scope; detailed task execution is out of scope / in Jira)**
- 2) Nested WBS tree (arbitrary depth)
- 3) Milestones only (no WBS)
- 4) Other (please specify): _______

**Answer**: 

---

### D3-4: Project Health model
**Question**: How is health (On Track / At Risk / Off Track) determined (US-018)?
- 1) **Manually set by the PM, with an optional derived hint (e.g., overdue milestones → suggest At Risk)** **(Recommended)**
- 2) Purely manual
- 3) Fully auto-derived from milestone/schedule signals
- 4) Other (please specify): _______

**Answer**: 

---

### D3-5: Correctness & Property-Based Testing (MANDATORY)
**Question**: Which properties should carry PBT for this unit (partial/blocking)?
- 1) **Yes — roll-up aggregation (counts by health are consistent/total-preserving) + overdue-milestone detection (pure date logic) + project date-range validation** **(Recommended)**
- 2) Yes — date-range validation only
- 3) No PBT in this unit (defer)
- 4) Other (please specify): _______

**Answer**: 

---

### D3-6: Domain events published
**Question**: Confirm the events this unit publishes (consumed by resource/risk/reporting)?
- 1) **`project-execution.project.created`, `.milestone.overdue`, `.status.changed`, `.rollup.recomputed`; subscribes `demand-intake.demand.promoted`** **(Recommended — matches units.md)**
- 2) Minimal — only `status.changed`
- 3) Other (please specify): _______

**Answer**: 

---

## Decisions Summary
<!-- Auto-populated after user fills answers. One line per decision. -->
- D3-1 Portfolio reference: 
- D3-2 Roll-up: 
- D3-3 Work structure: 
- D3-4 Health model: 
- D3-5 PBT: 
- D3-6 Events: 

---

**Instructions**: Fill in your answers above and respond with "done" — or say "use recommendations".
