# Context Assessment

## Summary
<!-- 10-line max. Downstream phases read ONLY this section. -->
- **Type**: Greenfield
- **Stack**: Pending D3 decisions (deferred to Design phase)
- **Architecture**: Pending D2/D3 decisions — likely modular/service-oriented given multi-domain scope
- **Feature**: An Enterprise Project & Portfolio Management (EPM/EPPM) platform for an EPMO to allocate resources, manage cross-team/portfolio risks, and align all projects to strategic business goals.
- **Impact**: New standalone product (greenfield, no existing codebase)
- **Complexity**: High — ~30+ stories, 8+ functional domains, 8 user types, 4+ external integrations
- **Recommendations**: Personas Yes, Units Yes, NFR Yes

## Project Overview
- **Type**: Greenfield
- **Assessment Date**: 2026-07-07

## Technology Stack
- **Languages**: N/A — greenfield project (Pending D3 decisions)
- **Frameworks**: N/A — greenfield project (Pending D3 decisions)
- **Build System**: N/A — greenfield project (Pending D3 decisions)
- **Testing**: N/A — greenfield project (Pending D3 decisions)
- **Infrastructure**: N/A — greenfield project (Pending D3 decisions)

## Feature Impact

**Affected Areas**: New standalone — an entirely new platform. No existing code to modify.

| Area | Impact | Reason |
|------|--------|--------|
| Portfolio & Strategic Alignment | New | Core EPMO function — link projects to business goals/OKRs |
| Resource Management & Capacity | New | Allocate people across teams, track utilization |
| Risk, Issue & Dependency Mgmt | New | Cross-team/portfolio RAID register |
| Project & Program Execution | New | Schedules, milestones, WBS, status |
| Demand Intake & Prioritization | New | Project requests, scoring, stage-gates |
| Financials & Benefits | New | Budgets, cost tracking, benefits realization |
| Governance, Dashboards & Reporting | New | Executive KPIs, portfolio health |
| Identity, Access & Integrations | New | SSO, HR/ERP/execution-tool integrations |

## Recommendations

- Story Count: **High (30+)** — the platform spans intake through delivery and reporting
- Domain Boundaries: Portfolio, Resource, Risk/RAID, Project Execution, Demand Intake, Financials, Governance/Reporting, Identity & Integrations
- User Types: EPMO Director, Portfolio Manager, Program Manager, Project Manager, Resource Manager, Team Member, Executive/Sponsor, Finance Controller
- Integration Points: SSO/Identity (SAML/OIDC), HR system (resource master), Finance/ERP (budgets/actuals), Execution tools (Jira/Azure DevOps), BI/reporting, Email/calendar
- **Personas**: **Yes** — 8 distinct user types with conflicting goals (governance vs. delivery); persona modeling will disambiguate requirements
- **Units**: **Yes** — 8 functional domains with clear DDD boundaries warrant decomposition into independently designed/built units
- **NFR**: **Yes** — enterprise-grade: multi-tenant scale, RBAC/audit, data security & compliance, availability, reporting performance

## Recommended Workflow

```
       ┌─────────────┐
       │  Context ✅  │
       └──────┬──────┘
              ▼
       ┌──────────────────────┐
       │ Requirements         │  ← Personas: Yes
       └──────┬───────────────┘
              ▼
       ┌───────────────┐
       │ Plan (DP gate)│
       └──────┬────────┘
              ▼
       ┌───────────────┐
       │ Decomposition │  ← 8 domains → units
       └───────┬───────┘
               ▼
       ┌────────────┐
       │ Foundation │  ← shared contracts/conventions (greenfield)
       └──┬──────┬──┘
          │      │
          ▼      ▼
     ┌────────┐ ┌────────┐
     │ Unit 1 │ │ Unit N │  ← each: Design (NFR: Yes) → Tasks → Implement
     └───┬────┘ └───┬────┘
         │          │
         ▼          ▼
     ┌──────────────────┐
     │ Solutions Review │
     └────────┬─────────┘
              ▼
     ┌─────────────┐
     │ Code Review │
     └──────┬──────┘
            ▼
     ┌─────────────┐
     │ Operations  │ (optional)
     └─────────────┘
```
