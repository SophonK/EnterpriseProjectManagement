# Requirements

## Summary
<!-- 10-line max. Downstream phases read ONLY this section. -->
- **Total Stories**: 32 across 7 functional areas
- **Priority**: 16 High, 11 Medium, 5 Low
- **User Types**: EPMO Director, Portfolio Manager, Project Manager, Resource Manager (4 more roles deferred to Phase 2)
- **Key Entities**: StrategicGoal, Portfolio, Program, Project, Milestone, Resource, Allocation, RaidItem, DemandRequest, User/Role
- **Integrations**: SSO (SAML/OIDC) only in MVP; HR, Finance/ERP, Jira/Azure DevOps deferred
- **Core Flows**: (1) SSO + RBAC access; (2) Goal→Portfolio→Program→Project alignment; (3) Capacity allocation & over-allocation control; (4) Portfolio RAID & dependencies; (5) Demand intake → scoring → stage-gate → project
- **Out of Scope**: detailed task/kanban execution, timesheets, document management, financial actuals/benefits (Phase 2)

## Overview
User stories organized by functional area with EARS notation acceptance criteria. All stories are scoped to the governance-first MVP defined in D1. Extensions enabled (blocking downstream): security-baseline, resiliency-baseline, property-based-testing (partial).

---

## Functional Area 1: Identity, Access & Audit

### US-001: SSO Login (SAML/OIDC)
**As a** platform user
**I want** to sign in through the enterprise identity provider
**So that** I use my existing corporate credentials without a separate password

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** an unauthenticated user opens the app, **THEN** the system shall redirect them to the configured SSO identity provider (SAML 2.0 or OIDC).
2. **WHEN** the identity provider returns a valid assertion, **THEN** the system shall establish an authenticated session and map the user to their platform account.
3. **IF** the assertion is invalid or expired, **THEN** the system shall deny access and show a re-authentication prompt, **ELSE** it shall grant access.
4. **IF** the authenticated identity has no matching platform account, **THEN** the system shall deny access and log the attempt.

**Dependencies**: None
**Source**: D1-9 (Integrations), D1-10 (Access)

---

### US-002: Role-Based Access Control (RBAC)
**As an** EPMO Director
**I want** each user to be assigned one or more of the defined roles
**So that** users can only perform actions their role permits

**Priority**: High

**Acceptance Criteria**:
1. The system shall support the roles: EPMO Director, Portfolio Manager, Program Manager, Project Manager, Resource Manager, Executive/Sponsor, Finance Controller, Team Member.
2. **WHEN** a user attempts an action, **THEN** the system shall permit it only if their role grants the required permission.
3. **IF** a user lacks permission for an action, **THEN** the system shall block it and return an authorization error, **ELSE** it shall proceed.

**Dependencies**: US-001
**Source**: D1-10 (Access)

---

### US-003: Record-Level Scoping
**As a** Project Manager
**I want** my access limited to the records I own or am assigned to
**So that** I cannot view or change other teams' projects

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a user requests a list of portfolios/programs/projects/resource-pools, **THEN** the system shall return only records they own or are explicitly granted access to.
2. **IF** a user directly requests a record outside their scope, **THEN** the system shall deny access and log the attempt, **ELSE** it shall return the record.
3. **WHERE** a user holds the EPMO Director role, **WHEN** they request records, **THEN** the system shall return all records enterprise-wide.

**Dependencies**: US-002
**Source**: D1-10 (Access)

---

### US-004: Audit Trail
**As an** EPMO Director
**I want** every create/update/delete and access-denied event recorded
**So that** governance and compliance can review who changed what and when

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** any entity is created, updated, or deleted, **THEN** the system shall record actor, timestamp, entity, action, and before/after values.
2. **WHEN** an access-denied event occurs, **THEN** the system shall record actor, timestamp, and attempted action.
3. **IF** a user without audit-view permission requests the audit log, **THEN** the system shall deny access, **ELSE** it shall return the filtered log.
4. The system shall retain audit records as immutable (no edit/delete via the application).

**Dependencies**: US-002
**Source**: D1-10 (Access), D1-14 (NFR), security-baseline extension

---

### US-005: Session Management & Timeout
**As a** security-conscious user
**I want** idle sessions to expire automatically
**So that** an unattended session cannot be misused

**Priority**: Medium

**Acceptance Criteria**:
1. **WHILE** a session is idle beyond the configured timeout, **IF** the user makes a request, **THEN** the system shall require re-authentication.
2. **WHEN** a user signs out, **THEN** the system shall invalidate the session immediately.

**Dependencies**: US-001
**Source**: D1-14 (NFR), security-baseline extension

---

## Functional Area 2: Strategic Alignment & Portfolio

### US-006: Define Strategic Goals / OKRs
**As an** EPMO Director
**I want** to define the organization's strategic goals/OKRs
**So that** projects can be linked to what the business is trying to achieve

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a Director creates a strategic goal with title, description, and target/measure, **THEN** the system shall persist it and make it available for linking.
2. **IF** a required field is missing, **THEN** the system shall reject the save and highlight the field, **ELSE** it shall save.

**Dependencies**: US-002
**Source**: D1-3 (Hierarchy/Alignment)

---

### US-007: Create & Manage Portfolios
**As a** Portfolio Manager
**I want** to create and maintain portfolios
**So that** related programs and projects are grouped for governance

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a Portfolio Manager creates a portfolio with name and owner, **THEN** the system shall persist it and assign the creator as owner.
2. **WHEN** a portfolio is created, **THEN** the system shall allow associating one or more strategic goals with it.

**Dependencies**: US-006
**Source**: D1-3 (Hierarchy/Alignment)

---

### US-008: Link Project to Strategic Goal
**As a** Portfolio Manager
**I want** every project to be linked to at least one strategic goal
**So that** we can prove the portfolio is aligned to strategy

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a project is created or edited, **THEN** the system shall allow linking it to one or more strategic goals.
2. **IF** a project is activated without any linked strategic goal, **THEN** the system shall flag it as "unaligned" and warn the owner, **ELSE** it shall mark it aligned.

**Dependencies**: US-006, US-016
**Source**: D1-3 (Hierarchy/Alignment)

---

### US-009: Portfolio Investment-Mix View
**As a** Portfolio Manager
**I want** to see how investment is distributed across goals and portfolios
**So that** I can rebalance toward strategic priorities

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a Portfolio Manager opens the investment-mix view, **THEN** the system shall show the count/planned-budget of projects grouped by strategic goal and by portfolio.
2. **WHERE** planned budget is present on projects, **WHEN** the view renders, **THEN** the system shall aggregate planned budget per grouping.

**Dependencies**: US-007, US-008
**Source**: D1-3, D1-6 (planned-budget attribute)

---

### US-010: Surface Unaligned Work
**As an** EPMO Director
**I want** to see all active projects not linked to any strategic goal
**So that** I can question or stop work that doesn't serve strategy

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a Director opens the alignment report, **THEN** the system shall list all active projects with no linked strategic goal.
2. **IF** there are no unaligned projects, **THEN** the system shall show a "fully aligned" state, **ELSE** it shall list them with owner and portfolio.

**Dependencies**: US-008
**Source**: D1-3 (Hierarchy/Alignment)

---

## Functional Area 3: Project & Program Execution

### US-011: Create & Manage Programs
**As a** Portfolio Manager
**I want** to create programs and group related projects under them
**So that** cross-project coordination has a home

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a Portfolio Manager creates a program within a portfolio, **THEN** the system shall persist it under that portfolio.
2. **WHEN** projects are assigned to a program, **THEN** the system shall reflect them in the program's roll-up.

**Dependencies**: US-007
**Source**: D1-3 (Hierarchy/Alignment)

---

### US-016: Create & Manage Projects
**As a** Project Manager
**I want** to create and maintain projects with core attributes
**So that** each initiative is tracked consistently

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a PM creates a project with name, owner, portfolio (optional program), planned start/end, and planned budget, **THEN** the system shall persist it.
2. **IF** planned end precedes planned start, **THEN** the system shall reject the save with a validation error, **ELSE** it shall save.
3. **WHEN** a project is saved, **THEN** the system shall record the change in the audit trail.

**Dependencies**: US-007
**Source**: D1-1 (Scope), D1-6 (planned-budget attribute)

---

### US-017: Milestones & Work Breakdown
**As a** Project Manager
**I want** to define milestones and a lightweight work breakdown
**So that** progress is measurable against a plan

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a PM adds a milestone with title and due date, **THEN** the system shall persist it under the project.
2. **WHILE** a milestone's due date has passed, **IF** it is not marked complete, **THEN** the system shall flag it as overdue.

**Dependencies**: US-016
**Source**: D1-1 (Scope)

---

### US-018: Project Status & Health
**As a** Project Manager
**I want** to set project status and health (e.g., On Track / At Risk / Off Track)
**So that** stakeholders see an honest current state

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a PM updates status/health with an optional note, **THEN** the system shall persist it with timestamp and actor.
2. **WHEN** health is set to "At Risk" or "Off Track", **THEN** the system shall make the project visible in portfolio at-risk views.

**Dependencies**: US-016
**Source**: D1-8 (Reporting)

---

### US-019: Status Roll-Up
**As an** EPMO Director
**I want** project status to roll up to program and portfolio
**So that** I see aggregate health without manual consolidation

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a project's status/health changes, **THEN** the system shall recompute the parent program and portfolio roll-up.
2. **WHEN** a portfolio roll-up is requested, **THEN** the system shall show counts by health across all in-scope projects.

**Dependencies**: US-018, US-011
**Source**: D1-8 (Reporting)

---

## Functional Area 4: Resource & Capacity Management

### US-020: Manage Resources & Skills
**As a** Resource Manager
**I want** to maintain resources (people) and their skills and capacity
**So that** allocation decisions use accurate data

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a Resource Manager creates a resource with name, pool, capacity (hours or FTE per period), and skills, **THEN** the system shall persist it.
2. **WHEN** a resource's capacity changes, **THEN** the system shall recompute affected utilization figures.

**Dependencies**: US-002
**Source**: D1-4 (Resource Depth)

---

### US-021: Allocate Resources by Percentage
**As a** Resource Manager
**I want** to allocate a resource to a project by percentage over a period
**So that** effort commitments are explicit and time-bound

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a Resource Manager assigns a resource to a project at X% for a date range, **THEN** the system shall persist the allocation.
2. **IF** the date range is invalid (end before start), **THEN** the system shall reject it, **ELSE** it shall save.

**Dependencies**: US-020, US-016
**Source**: D1-4 (Resource Depth)

---

### US-022: Over-Allocation Warning
**As a** Resource Manager
**I want** to be warned when a resource's total allocation exceeds 100% in any period
**So that** I avoid double-booking people

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a new or edited allocation would push a resource above 100% in any overlapping period, **THEN** the system shall display an over-allocation warning showing the conflicting periods and total.
2. **IF** the manager confirms despite the warning, **THEN** the system shall save and mark the resource over-allocated, **ELSE** it shall not save.

**Dependencies**: US-021
**Source**: D1-4 (Resource Depth), property-based-testing extension (allocation math)

---

### US-023: Utilization View / Heatmap
**As a** Resource Manager
**I want** a utilization heatmap across my pool and periods
**So that** I can spot over- and under-utilization at a glance

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a Resource Manager opens the utilization view, **THEN** the system shall show each resource's allocated % per period with visual banding (under/optimal/over).
2. **WHERE** the viewer is an EPMO Director, **WHEN** the view renders, **THEN** the system shall allow it across all pools.

**Dependencies**: US-021
**Source**: D1-4 (Resource Depth), D1-8 (Reporting)

---

### US-024: Capacity vs. Demand
**As a** Portfolio Manager
**I want** to compare available capacity against project demand
**So that** I don't approve more work than we can staff

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a Portfolio Manager opens capacity-vs-demand for a period, **THEN** the system shall show total capacity, total allocated demand, and the gap per pool/skill.
2. **IF** demand exceeds capacity for a period, **THEN** the system shall flag the shortfall, **ELSE** it shall show available headroom.

**Dependencies**: US-020, US-021
**Source**: D1-4 (Resource Depth)

---

## Functional Area 5: Risk / RAID & Dependencies

### US-025: Log RAID Item with Scoring
**As a** Project Manager
**I want** to log Risks, Assumptions, Issues, and Dependencies with severity and probability
**So that** they are tracked and prioritized consistently

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a user creates a RAID item with type, description, severity, and probability, **THEN** the system shall persist it and compute a risk score.
2. **IF** severity or probability is missing for a Risk-type item, **THEN** the system shall reject the save, **ELSE** it shall save.

**Dependencies**: US-016
**Source**: D1-5 (RAID)

---

### US-026: Assign Owner & Mitigation
**As a** Project Manager
**I want** to assign an owner and mitigation plan to each RAID item
**So that** accountability and response are clear

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a user sets an owner and mitigation/response on a RAID item, **THEN** the system shall persist them and set status to "In Progress".
2. **WHEN** a RAID item is marked resolved/closed, **THEN** the system shall record who closed it and when.

**Dependencies**: US-025
**Source**: D1-5 (RAID)

---

### US-027: Cross-Project Dependency Link
**As a** Program Manager (or Portfolio Manager in MVP)
**I want** to link a dependency between two projects
**So that** cross-team dependencies are visible at the portfolio level

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a user creates a dependency linking project A to project B with a description, **THEN** the system shall persist the link and show it on both projects.
2. **IF** the link would create a direct circular dependency (A→B and B→A), **THEN** the system shall reject it with a warning, **ELSE** it shall save.

**Dependencies**: US-025, US-016
**Source**: D1-5 (RAID)

---

### US-028: Risk Escalation
**As a** Portfolio Manager
**I want** high-scoring risks to be escalated to portfolio visibility
**So that** the EPMO can act before strategy is threatened

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a RAID item's risk score crosses the configured escalation threshold, **THEN** the system shall flag it for portfolio-level attention.
2. **WHEN** an escalated risk is viewed at portfolio level, **THEN** the system shall show its project, owner, score, and mitigation status.

**Dependencies**: US-025
**Source**: D1-5 (RAID)

---

## Functional Area 6: Demand Intake & Prioritization

### US-029: Submit Intake Request
**As a** Portfolio Manager
**I want** to capture new project requests via an intake form
**So that** proposed work enters a consistent evaluation pipeline

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a user submits an intake request with title, sponsor, description, and expected value, **THEN** the system shall persist it in "Submitted" status.
2. **IF** a required intake field is missing, **THEN** the system shall reject submission and highlight it, **ELSE** it shall submit.

**Dependencies**: US-002
**Source**: D1-7 (Intake)

---

### US-030: Configurable Scoring
**As an** EPMO Director
**I want** intake requests scored against configurable criteria (strategic fit, value, cost, risk)
**So that** prioritization is objective and comparable

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a Director defines scoring criteria with weights, **THEN** the system shall apply them to intake requests.
2. **WHEN** scores are entered for a request, **THEN** the system shall compute a weighted total and rank it against other requests.

**Dependencies**: US-029
**Source**: D1-7 (Intake)

---

### US-031: Stage-Gate Approval Workflow
**As a** Portfolio Manager
**I want** intake requests to move through approval gates
**So that** only governed, approved work becomes a project

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a request is advanced, **THEN** the system shall move it to the next gate only if the approver has permission for that gate.
2. **IF** a request is rejected at a gate, **THEN** the system shall set status to "Rejected" and record the reason, **ELSE** it shall advance.

**Dependencies**: US-029
**Source**: D1-7 (Intake)

---

### US-032: Promote Demand to Project
**As a** Portfolio Manager
**I want** an approved intake request to become a project
**So that** no data is re-keyed when work is greenlit

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** a request passes the final approval gate, **THEN** the system shall create a project pre-populated from the intake data.
2. **WHEN** the project is created from intake, **THEN** the system shall link back to the originating request for traceability.

**Dependencies**: US-031, US-016
**Source**: D1-7 (Intake)

---

## Functional Area 7: Governance Dashboards & Reporting

### US-012: Portfolio Health Dashboard
**As an** EPMO Director
**I want** a prebuilt portfolio health dashboard
**So that** I see overall status, alignment, and risk at a glance

**Priority**: High

**Acceptance Criteria**:
1. **WHEN** a Director opens the dashboard, **THEN** the system shall show project counts by health, alignment coverage, and top escalated risks across in-scope portfolios.
2. **WHILE** the dashboard is open, **WHEN** underlying data changes, **THEN** the system shall reflect updated figures on refresh.

**Dependencies**: US-019, US-028
**Source**: D1-8 (Reporting)

---

### US-013: Capacity Heatmap Dashboard
**As a** Resource Manager
**I want** a capacity/utilization dashboard tile
**So that** staffing pressure is visible alongside portfolio health

**Priority**: Medium

**Acceptance Criteria**:
1. **WHEN** the capacity dashboard is opened, **THEN** the system shall show utilization banding per pool for the selected period.
2. **WHERE** over-allocation exists, **WHEN** the dashboard renders, **THEN** the system shall highlight the affected pools.

**Dependencies**: US-023
**Source**: D1-8 (Reporting)

---

### US-014: Risk Summary Report
**As a** Portfolio Manager
**I want** a risk summary across in-scope projects
**So that** I can run risk reviews from one place

**Priority**: Low

**Acceptance Criteria**:
1. **WHEN** the risk summary is opened, **THEN** the system shall list open RAID items ranked by score with owner and mitigation status.
2. **IF** filters (project, type, status) are applied, **THEN** the system shall restrict results accordingly.

**Dependencies**: US-025
**Source**: D1-8 (Reporting)

---

### US-015: Export Report
**As an** EPMO Director
**I want** to export a dashboard/report to a shareable file
**So that** I can distribute governance updates outside the platform

**Priority**: Low

**Acceptance Criteria**:
1. **WHEN** a user chooses export on a report, **THEN** the system shall generate a file (e.g., PDF/CSV) of the current filtered view.
2. **IF** the export exceeds the size/row limit, **THEN** the system shall notify the user and offer a narrower filter, **ELSE** it shall deliver the file.

**Dependencies**: US-012
**Source**: D1-8 (Reporting)

---

## Story Summary

| ID | Title | Area | Priority | Dependencies |
|----|-------|------|----------|--------------|
| US-001 | SSO Login (SAML/OIDC) | Identity/Access | High | None |
| US-002 | Role-Based Access Control | Identity/Access | High | US-001 |
| US-003 | Record-Level Scoping | Identity/Access | High | US-002 |
| US-004 | Audit Trail | Identity/Access | High | US-002 |
| US-005 | Session Management & Timeout | Identity/Access | Medium | US-001 |
| US-006 | Define Strategic Goals/OKRs | Strategic Alignment | High | US-002 |
| US-007 | Create & Manage Portfolios | Strategic Alignment | High | US-006 |
| US-008 | Link Project to Strategic Goal | Strategic Alignment | High | US-006, US-016 |
| US-009 | Portfolio Investment-Mix View | Strategic Alignment | Medium | US-007, US-008 |
| US-010 | Surface Unaligned Work | Strategic Alignment | Medium | US-008 |
| US-011 | Create & Manage Programs | Project Execution | Medium | US-007 |
| US-016 | Create & Manage Projects | Project Execution | High | US-007 |
| US-017 | Milestones & Work Breakdown | Project Execution | High | US-016 |
| US-018 | Project Status & Health | Project Execution | High | US-016 |
| US-019 | Status Roll-Up | Project Execution | Medium | US-018, US-011 |
| US-020 | Manage Resources & Skills | Resource Mgmt | High | US-002 |
| US-021 | Allocate Resources by % | Resource Mgmt | High | US-020, US-016 |
| US-022 | Over-Allocation Warning | Resource Mgmt | High | US-021 |
| US-023 | Utilization View / Heatmap | Resource Mgmt | Medium | US-021 |
| US-024 | Capacity vs. Demand | Resource Mgmt | Medium | US-020, US-021 |
| US-025 | Log RAID Item with Scoring | Risk/RAID | High | US-016 |
| US-026 | Assign Owner & Mitigation | Risk/RAID | High | US-025 |
| US-027 | Cross-Project Dependency Link | Risk/RAID | High | US-025, US-016 |
| US-028 | Risk Escalation | Risk/RAID | Medium | US-025 |
| US-029 | Submit Intake Request | Demand Intake | High | US-002 |
| US-030 | Configurable Scoring | Demand Intake | Medium | US-029 |
| US-031 | Stage-Gate Approval Workflow | Demand Intake | High | US-029 |
| US-032 | Promote Demand to Project | Demand Intake | Medium | US-031, US-016 |
| US-012 | Portfolio Health Dashboard | Dashboards/Reporting | High | US-019, US-028 |
| US-013 | Capacity Heatmap Dashboard | Dashboards/Reporting | Medium | US-023 |
| US-014 | Risk Summary Report | Dashboards/Reporting | Low | US-025 |
| US-015 | Export Report | Dashboards/Reporting | Low | US-012 |

---

## Story-Persona Matrix

| Story | EPMO Director | Portfolio Manager | Project Manager | Resource Manager |
|-------|---------------|-------------------|-----------------|------------------|
| US-001 | ✓ Primary | ✓ Primary | ✓ Primary | ✓ Primary |
| US-002 | ✓ Primary | — | ✓ Secondary | ✓ Secondary |
| US-003 | ✓ Secondary | ✓ Secondary | ✓ Primary | ✓ Primary |
| US-004 | ✓ Primary | ✓ Secondary | — | — |
| US-005 | ✓ Secondary | ✓ Secondary | ✓ Secondary | ✓ Secondary |
| US-006 | ✓ Primary | ✓ Secondary | — | — |
| US-007 | ✓ Secondary | ✓ Primary | — | — |
| US-008 | ✓ Secondary | ✓ Primary | ✓ Secondary | — |
| US-009 | ✓ Secondary | ✓ Primary | — | — |
| US-010 | ✓ Primary | ✓ Secondary | — | — |
| US-011 | — | ✓ Primary | ✓ Secondary | — |
| US-016 | — | ✓ Secondary | ✓ Primary | — |
| US-017 | — | — | ✓ Primary | — |
| US-018 | ✓ Secondary | ✓ Secondary | ✓ Primary | — |
| US-019 | ✓ Primary | ✓ Secondary | — | — |
| US-020 | — | — | — | ✓ Primary |
| US-021 | — | ✓ Secondary | ✓ Secondary | ✓ Primary |
| US-022 | — | — | — | ✓ Primary |
| US-023 | ✓ Secondary | — | — | ✓ Primary |
| US-024 | ✓ Secondary | ✓ Primary | — | ✓ Secondary |
| US-025 | — | ✓ Secondary | ✓ Primary | — |
| US-026 | — | ✓ Secondary | ✓ Primary | — |
| US-027 | — | ✓ Primary | ✓ Secondary | — |
| US-028 | ✓ Primary | ✓ Primary | — | — |
| US-029 | ✓ Secondary | ✓ Primary | — | — |
| US-030 | ✓ Primary | ✓ Secondary | — | — |
| US-031 | ✓ Secondary | ✓ Primary | — | — |
| US-032 | — | ✓ Primary | ✓ Secondary | — |
| US-012 | ✓ Primary | ✓ Secondary | — | — |
| US-013 | ✓ Secondary | ✓ Secondary | — | ✓ Primary |
| US-014 | ✓ Secondary | ✓ Primary | — | — |
| US-015 | ✓ Primary | ✓ Secondary | — | — |

---

## Non-Functional Considerations

Detailed NFRs are addressed at Design (D3/D4). Highlights from D1-14 and enabled extensions:

- **Security** (security-baseline — blocking): SSO-based authN, RBAC + record-level authZ on every request, immutable audit trail, encryption in transit/at rest, input validation, least-privilege. Applies to all stories; enforced at design/implement/code-review.
- **Resiliency** (resiliency-baseline — blocking, directional): availability targets, graceful degradation of dashboards, recoverability of portfolio data, observability of key flows.
- **Property-Based Testing** (partial — blocking for pure functions & serialization): allocation/utilization math (US-021–US-024), risk-score computation (US-025, US-028), and scoring rollups (US-030) are prime PBT targets; serialization round-trips for exported reports (US-015).
- **Performance/Scale**: reporting and roll-up must remain responsive at hundreds of projects and thousands of resources (D1-14); prefer precomputed roll-ups where feasible.
- **Auditability & Governance**: all state-changing actions traceable; stage-gate transitions logged with actor and reason.
