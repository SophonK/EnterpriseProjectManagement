# Personas

## Summary
<!-- Compact digest for downstream phases. -->
- **User Types**: 4 MVP personas (4 more deferred to Phase 2)
- **Key Roles**: EPMO Director, Portfolio Manager, Project Manager, Resource Manager
- **Design Implications**: RBAC with 8 roles + record-level scoping, full audit trail, dashboard-heavy read paths, capacity/allocation math, single-enterprise SSO

## Overview
This platform serves 8 distinct user types across governance and delivery. The **governance-first MVP** fully supports 4 core roles below. The remaining roles — **Program Manager, Executive/Sponsor, Finance Controller, Team Member** — are recognized in the RBAC model but their dedicated workflows are **deferred to Phase 2** (Financials, HR/execution-tool integration, and detailed task execution are out of MVP scope).

---

## EPMO Director

**Role**: Head of the Enterprise Project Management Office; owns portfolio governance and standards.

**Goals**:
- See real-time portfolio health, capacity, and strategic alignment in one place
- Enforce governance gates and ensure every active project traces to a business goal
- Identify cross-team risks and resource bottlenecks before they threaten strategy

**Pain Points**:
- Today relies on manually assembled status decks that are stale on arrival
- No single source of truth — data scattered across spreadsheets and siloed tools
- Cannot answer "are we working on the right things, and can we deliver them?" quickly

**User Journey**: Log in (SSO) → open portfolio health dashboard → drill into at-risk projects / over-allocated teams / unaligned work → set or review stage gates.

**Implications**: Needs a high-level, aggregated, read-heavy dashboard experience with drill-down; broadest RBAC visibility (all portfolios); governance controls (gates, standards).

---

## Portfolio Manager

**Role**: Owns a portfolio; balances the investment mix against strategy and capacity.

**Goals**:
- Prioritize demand and decide which projects to fund based on strategic fit and capacity
- Maintain a balanced investment mix aligned to business goals/OKRs
- Track portfolio-level risks and dependencies across constituent projects/programs

**Pain Points**:
- Prioritization is subjective and hard to defend without consistent scoring
- Approving new demand without visibility into remaining capacity causes overcommitment
- Cross-project dependencies surface too late

**User Journey**: Review intake queue → score/compare requests → approve via stage-gate → monitor portfolio mix, capacity, and RAID.

**Implications**: Needs intake scoring + stage-gate workflow, portfolio investment-mix view, capacity-vs-demand visibility, RAID roll-up; record-level scope limited to owned portfolio(s).

---

## Project Manager

**Role**: Plans and tracks a single project end-to-end.

**Goals**:
- Plan scope, schedule, and milestones; keep status current with minimal overhead
- Manage project risks, issues, and dependencies
- Request and confirm the resources needed to deliver

**Pain Points**:
- Duplicate status reporting across tools and decks
- Resource availability is opaque — requests compete invisibly with other projects
- Risks logged locally never reach portfolio attention

**User Journey**: Open owned project → update milestones/WBS and status → log RAID items → view/request allocated resources → roll status up automatically.

**Implications**: Needs efficient project CRUD, milestone/WBS management, project-level RAID that rolls up, resource-request visibility; record-level scope limited to owned project(s). Detailed task/kanban execution stays in Jira/DevOps (out of scope).

---

## Resource Manager

**Role**: Owns a pool of people (a team or discipline); manages their capacity and allocations.

**Goals**:
- Maintain accurate capacity and skills for the resource pool
- Allocate people to projects by percentage over time without over-committing
- Expose demand-vs-supply gaps early

**Pain Points**:
- Over-allocation is discovered only after people are already double-booked
- Skills data is informal, making the right match slow
- No clear view of utilization across the pool

**User Journey**: Maintain resources & skills → review incoming allocation demand → assign % allocation per period → get warned on over-allocation → monitor utilization heatmap.

**Implications**: Needs resource/skills management, period-based % allocation, over-allocation validation, utilization/heatmap views; record-level scope limited to owned resource pool(s).

---

## Deferred Personas (Phase 2)

Recognized in RBAC now; dedicated workflows deferred:
- **Program Manager** — coordinates related projects & cross-team dependencies toward a shared outcome.
- **Executive / Sponsor** — read-only consumer of portfolio outcomes vs. strategy; funding/gate approval.
- **Finance Controller** — budgets, actuals, forecasts, benefits realization (Financials domain is Phase 2).
- **Team Member / Contributor** — assignments and effort logging (task execution/timesheets out of scope).

---

## Design Implications

- **Architecture**: RBAC with 8 roles plus **record-level scoping** (users act only within their owned portfolio/program/project/resource-pool). Full **audit trail** on all state changes. Single-enterprise tenancy (one org, many departments).
- **UI/UX**: Dashboard- and report-centric for Director/Portfolio roles; efficient data-entry flows for PM/Resource Manager. Prebuilt role-based dashboards with drill-down and export.
- **Data & Privacy**: Central relational model spanning goals → portfolio → program → project → milestone, resources/allocations, and RAID. Access filtered by role + ownership. Security-baseline and resiliency-baseline extensions apply as blocking constraints downstream.
