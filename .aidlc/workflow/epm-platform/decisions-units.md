# Decomposition Decisions (D2)

## Context Summary
- **Feature**: EPM/EPPM platform (governance-first MVP) · Greenfield · High complexity
- **Requirements**: 32 stories · 7 functional areas · 4 MVP personas · SSO integration
- **Plan**: incremental delivery, Foundation first, expanded design, Medium risk
- **Team**: small (4 devs, tech-lead-devs), Tech Lead: Sophon
- **Component sketch**: 7 candidate units (Identity, Strategy&Portfolio, Project Execution, Resource, Risk/RAID, Demand Intake, Reporting); Identity is foundational; Reporting is read-side.

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"**.

---

## Decision Questions

### D2-1: Decomposition Need
**Question**: Confirm decomposing the platform into units (vs. one monolithic design)?
- 1) **Yes — decompose into DDD units** **(Recommended)**
- 2) No — single unit
- 3) Other (please specify): _______

**Answer**: 

---

### D2-2: Architecture Pattern
**Question**: What deployment/architecture pattern should the units follow?
- 1) **Modular Monolith — one deployable, strong module boundaries; can split later** **(Recommended for a 4-dev team)**
- 2) Microservices — independently deployable services (higher ops overhead)
- 3) Hybrid — monolith now with service-ready boundaries
- 4) Other (please specify): _______

**Answer**: 

---

### D2-3: Decomposition Strategy
**Question**: How should unit boundaries be drawn?
- 1) **Domain-Driven (bounded contexts) — one unit per business capability** **(Recommended)**
- 2) Layer-based (UI / API / data)
- 3) User-journey-based
- 4) Other (please specify): _______

**Answer**: 

---

### D2-4: Unit Proposals
**Question**: Accept the proposed 7 units and story assignments?
Proposed units:
1. **Identity, Access & Audit** — SSO, RBAC, record-scoping, audit (US-001–005) → *foundation-adjacent*
2. **Strategy & Portfolio** — goals/OKRs, portfolio, program, alignment (US-006–011)
3. **Project Execution** — projects, milestones, status, roll-up (US-016–019)
4. **Resource Management** — resources, allocation, utilization, capacity (US-020–024)
5. **Risk / RAID** — RAID register, scoring, dependencies, escalation (US-025–028)
6. **Demand Intake** — intake, scoring, stage-gate, promote (US-029–032)
7. **Reporting & Dashboards** — dashboards + export (US-012–015)

- 1) **Accept all 7 units as proposed** **(Recommended)**
- 2) Merge some (e.g., Risk into Project Execution; Reporting into each unit)
- 3) Split further
- 4) Other (please specify): _______

**Answer**: 

---

### D2-5: Shared Kernel / Cross-Cutting
**Question**: How to handle shared concepts (hierarchy IDs, User/Role, references) and cross-cutting RBAC/audit?
- 1) **Shared Kernel + Identity/RBAC/audit provided by the Foundation; units consume via shared package** **(Recommended)**
- 2) One unit owns shared types; others consume via API
- 3) Each unit defines its own (accept drift)
- 4) Other (please specify): _______

**Answer**: 

---

### D2-6: Unit Interaction Style
**Question**: How do units communicate (given Modular Monolith)?
- 1) **In-process module APIs + shared data model; async events for roll-ups/escalation where useful** **(Recommended)**
- 2) Everything synchronous in-process
- 3) Message/event-driven throughout
- 4) Other (please specify): _______

**Answer**: 

---

### D2-7: Development Sequence
**Question**: What build order across units?
- 1) **Foundation + Identity first → Strategy&Portfolio → Project Execution → then Resource / Risk / Intake in parallel → Reporting last** **(Recommended)**
- 2) All units in parallel after Foundation
- 3) Strict sequential, one unit at a time
- 4) Other (please specify): _______

**Answer**: 

---

## Decisions Summary
<!-- Answered via "use recommendations" on 2026-07-07. -->
- D2-1 Decomposition Need: Yes — decompose into DDD units
- D2-2 Architecture Pattern: Modular Monolith (strong module boundaries; splittable later)
- D2-3 Strategy: Domain-Driven (bounded contexts, one unit per business capability)
- D2-4 Unit Proposals: Accept all 7 units as proposed (Identity, Strategy&Portfolio, Project Execution, Resource, Risk/RAID, Demand Intake, Reporting)
- D2-5 Shared Kernel: Shared Kernel + Identity/RBAC/audit provided by Foundation; units consume via shared package
- D2-6 Interaction Style: In-process module APIs + shared data model; async events for roll-ups/escalation
- D2-7 Dev Sequence: Foundation+Identity → Strategy&Portfolio → Project Execution → Resource/Risk/Intake (parallel) → Reporting last

---

## Validation Notes (D2)
- No blocking conflicts. Checks: Over-decomposition NOT triggered (32 stories > 10); Modular Monolith avoids Microservices-for-small-team risk; no circular dependencies; no unit < 2 or > 15 stories (range 4–6); distribution balanced (6 vs 4, < 3x).
- 🟡 Bottleneck note (pre-mitigated): Identity is depended on by all domain units. Resolved by D2-5 — Identity/RBAC/audit + shared kernel are extracted into the shared **Foundation** package (built first), so units consume a stable shared interface rather than blocking on a peer unit.

---

**Instructions**: Answers applied via "use recommendations".
