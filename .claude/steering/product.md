# Product Context

## Summary
<!-- 3-line max -->
- **Product**: An Enterprise Project & Portfolio Management (EPM/EPPM) platform for an EPMO to allocate resources, manage cross-team risks, and align projects to business strategy.
- **Users**: EPMO Director, Portfolio/Program/Project Managers, Resource Manager, Team Member, Executive/Sponsor, Finance Controller
- **Type**: Greenfield — new standalone enterprise product

## Overview

The platform gives an Enterprise Project Management Office (EPMO) a single system of record for the organization's project portfolio. It connects top-down strategy (business goals, OKRs, investment themes) to bottom-up execution (projects, tasks, resources), so leadership can see whether the portfolio is delivering the intended business outcomes. Core capabilities span demand intake and prioritization, portfolio and program management, project execution tracking, enterprise resource/capacity planning, cross-team risk and dependency management, financials and benefits realization, and governance dashboards.

## Problem Statement

Enterprises run dozens to hundreds of projects across independent teams using disconnected tools (spreadsheets, siloed Jira/DevOps instances, ad-hoc status decks). The EPMO cannot reliably answer: *Are we working on the right things? Do we have the capacity to deliver them? What cross-team risks threaten our strategic goals? Are projects delivering the business value we funded?* The result is over-allocation, blind-spot risks, misaligned investment, and slow, manual reporting. This platform centralizes portfolio data and governance to make resource allocation, risk management, and strategic alignment continuous and data-driven.

## Target Users

**MVP (fully supported):**
- **EPMO Director / PMO Lead**: Owns portfolio governance; needs portfolio health, capacity, and alignment at a glance; sets standards and gates.
- **Portfolio Manager**: Balances the mix of investments against strategy and capacity; prioritizes demand via intake scoring & stage-gates.
- **Project Manager**: Plans and tracks a single project — scope, schedule, milestones, resources, risks.
- **Resource Manager / Line Manager**: Owns a pool of people; manages % allocations, capacity, utilization, and skills.

**Recognized in RBAC, dedicated workflows deferred to Phase 2:**
- **Program Manager**, **Executive / Sponsor**, **Finance Controller**, **Team Member / Contributor**.

## Key Features

**MVP (governance-first):**
- **Identity, Access & Audit**: SSO (SAML/OIDC), RBAC across 8 roles, record-level scoping, immutable audit trail.
- **Strategic Alignment & Portfolio**: Goals/OKRs → Portfolio → Program → Project hierarchy; link every project to strategy; investment-mix view; surface unaligned work.
- **Project & Program Execution**: Projects, programs, milestones/WBS, status & health, roll-ups.
- **Enterprise Resource Management**: Capacity planning, % allocation, utilization heatmap, over-allocation warnings, capacity-vs-demand.
- **Risk, Issue & Dependency (RAID)**: Portfolio-level register with scoring, owner/mitigation, cross-project dependencies, escalation.
- **Demand Intake & Prioritization**: Intake form, configurable scoring, stage-gate approval, promote demand→project.
- **Governance, Dashboards & Reporting**: Prebuilt role-based dashboards (portfolio health, capacity heatmap, risk summary) + export.

**Phase 2 (deferred):**
- **Financials & Benefits Realization**: Budgets, actuals, forecasts, benefits (MVP captures planned-budget attribute only).
- **Integrations**: HR (resource master), Finance/ERP, Jira/Azure DevOps execution-tool sync.

**Explicitly out of scope**: detailed task/kanban execution, timesheets/time-tracking, document management.

## Domain Language

| Term | Definition | Example |
|------|-----------|---------|
| Portfolio | A collection of programs/projects managed together to meet strategic objectives | "The Digital Transformation portfolio" |
| Program | A group of related projects delivering a shared outcome | "Customer 360 program" |
| Project | A time-bound effort with defined scope, budget, and outcome | "Mobile app rev 2" |
| Demand / Intake | A proposed project awaiting evaluation and approval | "New warehouse system request" |
| Stage Gate | A governance checkpoint where a project is approved to proceed | "Gate 2: Business Case approval" |
| Resource / Capacity | People (with skills) available to be allocated, and their available hours | "Backend engineers, 320 hrs/wk" |
| Allocation | Assignment of a resource's capacity to a project for a period | "Anna 50% to Project X in Q3" |
| Utilization | Percentage of available capacity that is allocated/consumed | "Team at 92% utilization" |
| RAID | Risks, Assumptions, Issues, Dependencies register | "Cross-team dependency on Auth service" |
| Benefit Realization | Tracking whether funded business value is actually delivered | "Expected $2M savings, $1.4M realized" |
| OKR / Strategic Goal | Objective the portfolio aligns to | "Reduce time-to-market 30%" |

## Success Criteria

- **Portfolio visibility**: EPMO can view real-time portfolio health, capacity, and strategic alignment in one place (replacing manual status decks).
- **Resource optimization**: Reduce resource over-allocation conflicts; expose demand-vs-capacity gaps before they cause delays.
- **Risk transparency**: Cross-team risks and dependencies are visible and actively managed at the portfolio level.
- **Strategic alignment**: Every active project traces to at least one business goal/OKR; unaligned work is surfaced.
- Detailed measurable targets: **To be defined during requirements phase.**

## Constraints & Assumptions

**Constraints** (hard limits that shape decisions):
- Timeline: To be defined during requirements phase.
- Budget/Services: To be defined at Design (D3) — no stack chosen yet.
- Regulatory: Enterprise data governance likely (access control, audit trail, data residency) — confirm during requirements/NFR.
- Technical: Must integrate with enterprise SSO and existing execution tools (Jira/Azure DevOps); must support role-based access across many user types.

**Assumptions** (things we believe to be true but haven't verified):
- The organization has an identity provider supporting SAML/OIDC for SSO.
- Resource master data (people, skills) may originate in an HR system.
- Budget/actuals data may need to sync with a Finance/ERP system.
- The platform is multi-team/multi-department within a single enterprise (single-tenant enterprise deployment) unless requirements state otherwise.

## Project Type

- **Type**: Greenfield
- **Scope**: New product — a standalone enterprise platform built from scratch.
