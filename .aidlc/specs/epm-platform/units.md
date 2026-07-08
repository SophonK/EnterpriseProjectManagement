# Units of Work

## Summary
<!-- 10-line max. Downstream phases read ONLY this section. -->
- **Units**: 8 (1 infrastructure + 7 domain) — foundation, identity-access, strategy-portfolio, project-execution, resource-management, risk-raid, demand-intake, reporting-dashboards
- **Strategy**: Domain-Driven (bounded contexts)
- **Architecture**: Modular Monolith; in-process module APIs + shared data model; async events for roll-ups/escalation
- **Story Distribution**: identity-access: 5, strategy-portfolio: 6, project-execution: 4, resource-management: 5, risk-raid: 4, demand-intake: 4, reporting-dashboards: 4 (32 total)
- **Key Dependencies**: all → identity-access (shared kernel via Foundation); project-execution → strategy-portfolio; resource/risk → project-execution; demand-intake → strategy-portfolio + project-execution; reporting → (reads) strategy/execution/resource/risk
- **Development Sequence**: Foundation+Identity → Strategy&Portfolio → Project Execution → Resource/Risk/Intake (parallel) → Reporting last

## Overview
The platform is decomposed into 7 units for parallel development by a small team, coordinated by a shared Foundation. Identity/RBAC/audit and shared domain types are provided by the Foundation as a shared kernel so domain units stay decoupled.

**Strategy**: Domain-Driven
**Rationale**: Each unit is a cohesive business capability with its own aggregates and language. Domain boundaries match the 7 functional areas from requirements, enabling independent design/build and clean ownership per developer.

---

## Unit 0: foundation

**Purpose**: Infrastructure/scaffold unit for the Modular Monolith — shared packages and in-process infrastructure all domain units build on.
**Type**: Infrastructure (not domain)
**Source**: foundation
**Priority**: Foundation (design & implement BEFORE domain units)
**Complexity**: Medium
**Stories**: None (cross-cutting)

### Responsibilities
- Monorepo scaffold (pnpm workspaces + Turborepo), `docker-compose` for local Postgres
- `@epm/shared` package — domain types, DTOs, error codes, event schemas, `AuthContext`/`RecordScope`
- OAuth2/OIDC auth middleware producing `AuthContext`; RBAC + record-scope enforcement helpers
- RFC 7807 error handler + shared error-code registry
- In-process domain event bus (`DomainEvent<T>`), idempotent-handler helpers
- PostgreSQL setup + schema-per-unit migrations (`packages/db`), audit-log sink
- Logging/observability baseline (structured JSON, `X-Request-Id`)
- GitHub Actions CI (lint → test incl. PBT → build → deploy)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| — | — | None; all domain units depend on foundation |

**Depended on by**: all 7 domain units

---

## Unit 1: identity-access

**Purpose**: Authentication (SSO), authorization (RBAC + record-level scoping), and audit logging for the whole platform. Foundation-adjacent — its primitives are exposed as a shared package.
**Priority**: High
**Complexity**: Medium
**Stories**: 5 — US-001, US-002, US-003, US-004, US-005

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| AuthenticateViaSSO | Establish session from SAML/OIDC assertion | System |
| AssignRole | Grant a user one or more roles | EPMO Director |
| CheckPermission | Authorize an action against role + record scope | System |
| RecordAuditEvent | Append immutable audit entry | System |

### Domain Model
**Aggregates**: User (root: User), Role, AuditEntry
**Entities**: User, Role, Permission, AuditEntry, Session
**Value Objects**: RecordScope, IdentityAssertion

### Domain Events
**Publishes**: UserAuthenticated, RoleAssigned, AccessDenied, AuditEventRecorded
**Subscribes**: (all units emit state-change events consumed here for audit)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| Foundation (shared kernel) | API | Provides base identity/RBAC/audit contracts consumed by all units |

---

## Unit 2: strategy-portfolio

**Purpose**: Strategic goals/OKRs and the portfolio→program hierarchy; alignment of work to strategy.
**Priority**: High
**Complexity**: Medium
**Stories**: 6 — US-006, US-007, US-008, US-009, US-010, US-011

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| DefineStrategicGoal | Create a goal/OKR | EPMO Director |
| CreatePortfolio | Create a portfolio, assign owner | Portfolio Manager |
| CreateProgram | Create a program under a portfolio | Portfolio Manager |
| LinkProjectToGoal | Associate a project with strategic goal(s) | Portfolio Manager |
| ViewInvestmentMix | Aggregate projects/budget by goal & portfolio | Portfolio Manager |

### Domain Model
**Aggregates**: StrategicGoal, Portfolio (root: Portfolio), Program
**Entities**: StrategicGoal, Portfolio, Program, GoalLink
**Value Objects**: AlignmentStatus, InvestmentSummary

### Domain Events
**Publishes**: PortfolioCreated, ProgramCreated, ProjectLinkedToGoal, ProjectFlaggedUnaligned
**Subscribes**: ProjectCreated from project-execution (to compute alignment coverage)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| identity-access | API | AuthZ + record scoping on portfolios/programs |
| project-execution | Data/Event | Alignment & investment-mix read project data |

---

## Unit 3: project-execution

**Purpose**: Projects and their milestones/WBS, status/health, and roll-up to program/portfolio.
**Priority**: High
**Complexity**: Medium
**Stories**: 4 — US-016, US-017, US-018, US-019

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| CreateProject | Create a project with core attributes | Project Manager |
| AddMilestone | Add a milestone / WBS item | Project Manager |
| UpdateStatusHealth | Set status and health with note | Project Manager |
| RecomputeRollup | Aggregate health to program/portfolio | System |

### Domain Model
**Aggregates**: Project (root: Project)
**Entities**: Project, Milestone, WorkBreakdownItem, StatusUpdate
**Value Objects**: Health (OnTrack/AtRisk/OffTrack), DateRange, PlannedBudget

### Domain Events
**Publishes**: ProjectCreated, MilestoneOverdue, StatusChanged, RollupRecomputed
**Subscribes**: DemandPromoted from demand-intake (create project from intake)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| identity-access | API | AuthZ + record scoping on projects |
| strategy-portfolio | API | Project belongs to a portfolio/program |

---

## Unit 4: resource-management

**Purpose**: Resources & skills, percentage allocation over periods, utilization, and capacity-vs-demand.
**Priority**: High
**Complexity**: High
**Stories**: 5 — US-020, US-021, US-022, US-023, US-024

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| ManageResource | Create/update a resource with skills & capacity | Resource Manager |
| AllocateResource | Assign % allocation to a project for a period | Resource Manager |
| ValidateAllocation | Detect >100% over-allocation across periods | System |
| ViewUtilization | Render utilization heatmap | Resource Manager |
| ComputeCapacityVsDemand | Compare capacity to allocated demand | Portfolio Manager |

### Domain Model
**Aggregates**: Resource (root: Resource), Allocation
**Entities**: Resource, Allocation, ResourcePool, Skill
**Value Objects**: CapacityPeriod, UtilizationBand, AllocationPercent

### Domain Events
**Publishes**: ResourceAllocated, ResourceOverAllocated
**Subscribes**: ProjectCreated from project-execution (allocations reference projects)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| identity-access | API | AuthZ + record scoping on resource pools |
| project-execution | Data | Allocations reference projects |

---

## Unit 5: risk-raid

**Purpose**: Portfolio-level RAID register with scoring, owner/mitigation, cross-project dependencies, and escalation.
**Priority**: High
**Complexity**: Medium
**Stories**: 4 — US-025, US-026, US-027, US-028

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| LogRaidItem | Create a RAID item with severity/probability | Project Manager |
| AssignOwnerMitigation | Set owner and mitigation, update status | Project Manager |
| LinkDependency | Link a dependency between two projects | Portfolio Manager |
| EscalateRisk | Flag risk crossing threshold to portfolio | System |

### Domain Model
**Aggregates**: RaidItem (root: RaidItem), Dependency
**Entities**: RaidItem, Dependency, Mitigation
**Value Objects**: RiskScore (severity×probability), RaidType, EscalationThreshold

### Domain Events
**Publishes**: RaidLogged, RiskEscalated, DependencyLinked
**Subscribes**: ProjectCreated from project-execution (RAID belongs to a project)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| identity-access | API | AuthZ + record scoping |
| project-execution | Data | RAID items and dependencies reference projects |

---

## Unit 6: demand-intake

**Purpose**: Capture project demand, score against configurable criteria, run stage-gate approval, and promote approved demand to a project.
**Priority**: Medium
**Complexity**: Medium
**Stories**: 4 — US-029, US-030, US-031, US-032

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| SubmitIntake | Submit a project request | Portfolio Manager |
| ConfigureScoring | Define weighted scoring criteria | EPMO Director |
| ScoreAndRank | Compute weighted score and rank | System |
| AdvanceGate | Move request through a stage-gate | Portfolio Manager |
| PromoteToProject | Create a project from approved demand | Portfolio Manager |

### Domain Model
**Aggregates**: DemandRequest (root: DemandRequest), ScoringModel
**Entities**: DemandRequest, ScoringCriterion, GateDecision
**Value Objects**: WeightedScore, GateStatus

### Domain Events
**Publishes**: DemandSubmitted, DemandApproved, DemandRejected, DemandPromoted
**Subscribes**: (consumes strategy goals for strategic-fit scoring)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| identity-access | API | AuthZ on submission/gates |
| strategy-portfolio | Data | Strategic-fit scoring against goals |
| project-execution | Event | Promote demand → create project |

---

## Unit 7: reporting-dashboards

**Purpose**: Read-side dashboards (portfolio health, capacity heatmap, risk summary) and export. Consumes read models from other units.
**Priority**: Medium
**Complexity**: Medium
**Stories**: 4 — US-012, US-013, US-014, US-015

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| RenderPortfolioHealth | Aggregate health/alignment/risk | EPMO Director |
| RenderCapacityHeatmap | Utilization per pool/period | Resource Manager |
| RenderRiskSummary | Ranked open RAID items | Portfolio Manager |
| ExportReport | Export current view to PDF/CSV | EPMO Director |

### Domain Model
**Aggregates**: (read-only projections) DashboardView, ReportExport
**Entities**: ReportDefinition, ExportJob
**Value Objects**: DashboardFilter, ExportFormat

### Domain Events
**Publishes**: ReportExported
**Subscribes**: StatusChanged, RollupRecomputed, ResourceOverAllocated, RiskEscalated (to refresh projections)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| identity-access | API | AuthZ + record scoping on report data |
| strategy-portfolio | Data | Alignment & investment metrics |
| project-execution | Data/Event | Status roll-ups |
| resource-management | Data/Event | Utilization data |
| risk-raid | Data/Event | Risk summary & escalations |

---

## Context Map

| Upstream | Downstream | Pattern |
|----------|------------|---------|
| Foundation (identity/RBAC/audit + shared types) | All units | Shared Kernel |
| strategy-portfolio | project-execution | Customer/Supplier |
| project-execution | resource-management | Customer/Supplier |
| project-execution | risk-raid | Customer/Supplier |
| strategy-portfolio + project-execution | demand-intake | Customer/Supplier |
| project-execution | reporting-dashboards | Publisher/Subscriber |
| resource-management | reporting-dashboards | Publisher/Subscriber |
| risk-raid | reporting-dashboards | Publisher/Subscriber |

**Patterns**: Shared Kernel (Foundation), Customer/Supplier, Publisher/Subscriber

---

## Development Sequence

### Phase 1: Foundation
- [ ] Foundation — shared kernel: identity/RBAC/audit, shared domain types, data-model conventions, API contracts, CI
- [ ] identity-access — SSO, RBAC config, record scoping, audit (builds on Foundation)

### Phase 2: Core
- [ ] strategy-portfolio — goals/portfolio/program hierarchy
- [ ] project-execution — projects, milestones, status, roll-up

### Phase 3: Supporting (parallelizable)
- [ ] resource-management — allocation & capacity
- [ ] risk-raid — RAID & dependencies
- [ ] demand-intake — intake, scoring, stage-gate

### Phase 4: Read-side
- [ ] reporting-dashboards — dashboards & export (last; consumes the others)
