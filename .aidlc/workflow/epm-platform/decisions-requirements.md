# Requirements Decisions (D1)

## Context Summary
- **Feature**: Enterprise Project & Portfolio Management (EPM/EPPM) platform for an EPMO — allocate resources, manage cross-team risks, align projects to business goals.
- **Type**: Greenfield · new standalone · High complexity (~30+ stories, 8 domains, 8 user types, 4+ integrations)
- **Team**: 2–4 developers (small), Tech Lead: Sophon · repo: SophonK/EnterpriseProjectManagement
- **Stack**: deferred to Design (D3)
- **8 domains**: Demand Intake · Portfolio/Strategic Alignment · Project/Program Execution · Resource & Capacity · Risk/RAID · Financials & Benefits · Governance/Reporting · Identity & Integrations

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"** to auto-fill every question with the **(Recommended)** option.

---

## Decision Questions

### D1-1: MVP Scope & Delivery Strategy
**Question**: This is a large platform. How should we scope the first deliverable?
- 1) **Governance-first MVP** — Portfolio alignment + Project tracking + Resource capacity + Risk/RAID + basic dashboards; defer Financials & advanced intake. **(Recommended)**
- 2) Intake-to-delivery MVP — Demand intake + prioritization + project execution first; portfolio analytics later
- 3) Full platform — all 8 domains in first release
- 4) Other (please specify): _______

**Answer**: 

---

### D1-2: Primary User Types for MVP
**Question**: Which user roles must be fully supported in the first release?
- 1) EPMO Director, Portfolio Manager, Project Manager, Resource Manager (core governance + delivery) **(Recommended)**
- 2) All 8 roles from day one (incl. Executive/Sponsor, Finance Controller, Program Manager, Team Member)
- 3) EPMO Director + Project Manager only (minimal), expand later
- 4) Other (please specify): _______

---

**Answer**: 

---

### D1-3: Portfolio Hierarchy & Strategic Alignment Model
**Question**: How should work be structured and linked to strategy?
- 1) **Goal/OKR → Portfolio → Program → Project → Milestone/Task**, with explicit strategic-goal linkage on every project **(Recommended)**
- 2) Portfolio → Project → Task (flat, no program layer, optional goal tags)
- 3) Free-form projects with optional grouping; alignment tracked via labels only
- 4) Other (please specify): _______

**Answer**: 

---

### D1-4: Resource & Capacity Management Depth
**Question**: How rich should resource allocation be in the MVP?
- 1) **Capacity planning with % allocation per person/period + utilization + skills tags + over-allocation warnings** **(Recommended)**
- 2) Named assignments only (who is on what), no capacity math
- 3) Full skills-marketplace with demand-vs-supply optimization and scenario planning
- 4) Other (please specify): _______

**Answer**: 

---

### D1-5: Risk, Issue & Dependency (RAID) Scope
**Question**: How should cross-team risk management work?
- 1) **Portfolio-level RAID register with severity/probability scoring, owner, mitigation, and cross-project dependency links + escalation** **(Recommended)**
- 2) Per-project risk logs only, rolled up read-only to portfolio view
- 3) Basic issue list without scoring or dependency mapping
- 4) Other (please specify): _______

**Answer**: 

---

### D1-6: Financials & Benefits Realization
**Question**: Should the MVP include budget/cost/benefits tracking?
- 1) **Defer to Phase 2** — capture planned budget as a project attribute only for now **(Recommended)**
- 2) Include full financials — budgets, actuals, forecasts, benefits realization in MVP
- 3) Budget + actuals only (no benefits realization) in MVP
- 4) Other (please specify): _______

**Answer**: 

---

### D1-7: Demand Intake & Prioritization
**Question**: How should new project requests be handled?
- 1) **Intake form + configurable scoring (strategic fit, value, cost, risk) + stage-gate approval workflow** **(Recommended)**
- 2) Simple request queue with manual approve/reject (no scoring)
- 3) Defer intake entirely — projects created directly by PMO for MVP
- 4) Other (please specify): _______

**Answer**: 

---

### D1-8: Governance, Dashboards & Reporting
**Question**: What reporting capability is needed for the MVP?
- 1) **Prebuilt role-based dashboards (portfolio health, capacity heatmap, risk summary, milestone status) + exportable reports** **(Recommended)**
- 2) Prebuilt dashboards only, no export
- 3) Fully configurable/custom report builder from day one
- 4) Other (please specify): _______

**Answer**: 

---

### D1-9: Integration Priority
**Question**: Which external integrations are required for MVP vs. deferred? (Rank/mark MVP-required.)
- 1) **MVP: SSO (SAML/OIDC) only. Deferred: HR sync, Finance/ERP, Jira/Azure DevOps** **(Recommended)**
- 2) MVP: SSO + Execution tools (Jira/Azure DevOps) for status sync
- 3) MVP: SSO + HR (resource master) sync
- 4) All integrations in MVP / Other (please specify): _______

**Answer**: 

---

### D1-10: Access Control & Audit
**Question**: What authorization model is required?
- 1) **Role-based access control (RBAC) with the 8 roles + record-level scoping (own portfolio/program/project) + full audit trail** **(Recommended)**
- 2) Simple role-based access (global roles, no record-level scoping)
- 3) Attribute-based access control (ABAC) with fine-grained policies
- 4) Other (please specify): _______

**Answer**: 

---

### D1-11: Multi-Tenancy / Deployment Model
**Question**: Who will the platform serve?
- 1) **Single enterprise (one organization, many departments/teams)** **(Recommended)**
- 2) Multi-tenant SaaS (multiple isolated client organizations)
- 3) Single team/department pilot, scale to enterprise later
- 4) Other (please specify): _______

**Answer**: 

---

### D1-12: Explicit Out-of-Scope Boundaries
**Question**: What should be explicitly EXCLUDED from this platform (to avoid scope creep)?
- 1) **Exclude: detailed task execution/kanban (defer to Jira/DevOps), time-tracking/timesheets, and document management — EPM focuses on portfolio governance** **(Recommended)**
- 2) Exclude time-tracking only; keep lightweight task boards in-platform
- 3) No exclusions — build everything in-platform
- 4) Other (please specify): _______

**Answer**: 

---

### D1-13: Personas (MANDATORY)
**Question**: Generate detailed personas for the distinct user types? (8 roles with differing/competing goals were identified.)
- 1) **Yes — generate personas to disambiguate governance vs. delivery needs** **(Recommended)**
- 2) No — user roles are clear enough from D1 answers
- 3) Other (please specify): _______

**Answer**: 

---

### D1-14: Non-Functional Requirements (NFR) Focus
**Question**: Which NFRs are most critical to call out for this enterprise platform?
- 1) **Security/RBAC + Audit + Availability + Reporting performance at scale (hundreds of projects, thousands of resources)** **(Recommended)**
- 2) Security + Audit only (performance addressed later)
- 3) Minimal NFRs (internal tool, low load)
- 4) Other (please specify): _______

**Answer**: 

---

## Extension Opt-Ins

### Question: Security Extensions
Should security extension rules be enforced for this project?

- A) **Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)** **(Recommended)**
- B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)
- X) Other (please describe after Answer below)

**Answer**: 

---

### Question: Resiliency Extensions
Should the resiliency baseline (AWS Well-Architected Reliability directional best practices) be applied?

- A) **Yes — apply the resiliency baseline as directional design-time guidance (recommended for business-critical workloads)** **(Recommended)**
- B) No — skip the resiliency baseline (PoCs/prototypes)
- X) Other (please describe after Answer below)

**Answer**: 

---

### Question: Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced?

- A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, stateful components)
- B) **Partial — enforce PBT only for pure functions and serialization round-trips** **(Recommended)**
- C) No — skip all PBT rules (simple CRUD/UI-only)
- X) Other (please describe after Answer below)

**Answer**: 

---

## Decisions Summary
<!-- Answered via "use recommendations" on 2026-07-07. -->
- D1-1 MVP Scope: Governance-first MVP — Portfolio alignment + Project tracking + Resource capacity + Risk/RAID + basic dashboards; defer Financials & advanced intake
- D1-2 MVP Users: EPMO Director, Portfolio Manager, Project Manager, Resource Manager (core governance + delivery)
- D1-3 Hierarchy/Alignment: Goal/OKR → Portfolio → Program → Project → Milestone/Task, explicit strategic-goal linkage per project
- D1-4 Resource Depth: Capacity planning with % allocation per person/period + utilization + skills tags + over-allocation warnings
- D1-5 RAID Scope: Portfolio-level RAID register with severity/probability scoring, owner, mitigation, cross-project dependency links + escalation
- D1-6 Financials: Defer to Phase 2 — capture planned budget as a project attribute only for now
- D1-7 Intake: Intake form + configurable scoring (strategic fit, value, cost, risk) + stage-gate approval workflow
- D1-8 Reporting: Prebuilt role-based dashboards (portfolio health, capacity heatmap, risk summary, milestone status) + exportable reports
- D1-9 Integrations: MVP = SSO (SAML/OIDC) only; deferred = HR sync, Finance/ERP, Jira/Azure DevOps
- D1-10 Access/Audit: RBAC with 8 roles + record-level scoping (own portfolio/program/project) + full audit trail
- D1-11 Tenancy: Single enterprise (one organization, many departments/teams)
- D1-12 Out-of-Scope: Exclude detailed task execution/kanban (defer to Jira/DevOps), time-tracking/timesheets, document management
- D1-13 Personas: Yes — generate personas
- D1-14 NFR Focus: Security/RBAC + Audit + Availability + Reporting performance at scale
- EXT Security: A) Yes — enforce SECURITY rules as blocking constraints
- EXT Resiliency: A) Yes — apply resiliency baseline as directional design-time guidance
- EXT Property-Based-Testing: B) Partial — PBT for pure functions and serialization round-trips only

---

## Validation Notes (D1)
- No conflicts detected. Personas enabled (8 user types); integrations prioritized (SSO-only MVP, rest phased); explicit out-of-scope boundaries defined; NFR flagged; team = small (4), not solo; no unmitigated compliance/performance gaps.
- Extensions enabled → **blocking constraints** downstream at design/implement/code-review: `security-baseline` (enabled), `resiliency-baseline` (enabled), `property-based-testing` (partial). `team-multi-developer` remains enabled (set at context).

---

**Instructions**: Answers applied via "use recommendations".
