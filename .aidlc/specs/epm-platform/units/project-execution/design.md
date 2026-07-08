# Design — Unit: project-execution (expanded)

## Summary
- **Unit**: project-execution (domain) · owner: Chavakorn
- **Stack**: NestJS (TS/Node 20) · Prisma + PostgreSQL (`execution` schema) · Zod · pino · in-process event bus · Vitest + fast-check · Docker (inherited from foundation)
- **Purpose**: Projects, milestones/WBS, status & health tracking, and status roll-up to program/portfolio
- **Stories**: US-016, US-017, US-018, US-019
- **Extensions enforced**: security-baseline ✅ · resiliency-baseline ✅ · property-based-testing (partial) ✅

## Architecture
`ProjectExecutionModule` is a NestJS module mounted at `apps/api/src/modules/project-execution/`. It owns the `execution` PostgreSQL schema and exposes an in-process `ProjectService` API consumed by resource-management, risk-raid, demand-intake, and reporting-dashboards. Status roll-up is event-driven: when a project's health changes it publishes `StatusChanged`; a roll-up handler in this same module recomputes the parent program/portfolio aggregate and publishes `RollupRecomputed`.

## Design Documents
### Compact core
- [components.md](design/components.md) — module components, service interfaces, repositories
- [data-model.md](design/data-model.md) — `execution` schema: tables, constraints, indexes
- [api-spec.md](design/api-spec.md) — REST endpoints, request/response shapes, error codes
- [integration.md](design/integration.md) — in-process seams: strategy-portfolio, identity-access, demand-intake event
- [implementation.md](design/implementation.md) — directory layout, build order, DoD
- [nfr.md](design/nfr.md) — compact NFR (security, resiliency)
- [correctness.md](design/correctness.md) — PBT properties (date-range validation, roll-up math, milestone overdue)

### Expanded deep dives
- [functional-design.md](design/functional-design.md) — aggregates, business rules, state machines, roll-up logic
- [nfr-requirements.md](design/nfr-requirements.md) — measurable NFRs
- [nfr-design.md](design/nfr-design.md) — security & resiliency patterns

## Key Design Decisions
| Concern | Decision | Rationale |
|---------|----------|-----------|
| Framework | NestJS (locked) | Foundation decision |
| ORM | Prisma multi-schema (locked) | Foundation decision |
| Schema | `execution` | One schema per unit; isolates migrations |
| Roll-up strategy | Event-driven (StatusChanged → RollupHandler) | Keeps read data fresh without polling; decoupled |
| Overdue detection | Real-time query + flag column (`overdue` bool, updated by domain check) | Avoids a scheduled job for MVP; simple and auditable |
| Soft-delete | Archive flag (`archivedAt`) on Project | Preserves audit history; projects are never truly deleted |
| Status state machine | Open → Active → Completed / Cancelled | Enforced in service layer; invalid transitions rejected |
| Health value object | Enum: OnTrack / AtRisk / OffTrack | Matches product language; drives portfolio at-risk view |
| PlannedBudget | Decimal attribute on Project (Phase 2 extended by financials) | D1-6 decision; no financials actuals in MVP |
| PBT coverage | Date-range validation, roll-up health counting, milestone overdue logic | property-based-testing extension (partial) |

## Traceability
| Story | Feature | Status |
|-------|---------|--------|
| US-016 | Create & manage projects (CRUD, planned budget, portfolio/program link) | In scope |
| US-017 | Milestones & lightweight WBS; overdue flagging | In scope |
| US-018 | Status & health update with note; At Risk / Off Track → portfolio view | In scope |
| US-019 | Status roll-up to program and portfolio | In scope |

## References
- Parent: [units.md](../../units.md) · [requirements.md](../../requirements.md)
- Foundation design: [../foundation/design.md](../foundation/design.md)
- Workflow: [../../../../workflow/epm-platform/aidlc-manifest.yaml](../../../../workflow/epm-platform/aidlc-manifest.yaml)
