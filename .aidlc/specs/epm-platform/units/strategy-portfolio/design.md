# Design — Unit: strategy-portfolio (expanded)

## Summary
- **Unit**: strategy-portfolio (domain) · owner: Sophon
- **Stack**: NestJS (TS/Node 20) · Prisma + PostgreSQL (`strategy` schema) · Zod · pino · in-process event bus + transactional outbox · Vitest + fast-check · Docker (inherited from foundation)
- **Purpose**: Strategic goals/OKRs and the portfolio→program hierarchy; alignment of projects to strategy and portfolio investment-mix
- **Stories**: US-006, US-007, US-008, US-009, US-010, US-011
- **Extensions enforced**: security-baseline ✅ · resiliency-baseline ✅ · property-based-testing (partial) ✅

## Architecture
`StrategyPortfolioModule` is a NestJS module mounted at `apps/api/src/modules/strategy-portfolio/`. It owns the `strategy` PostgreSQL schema (StrategicGoal, Portfolio, Program, PortfolioGoal, GoalLink) and exposes an in-process API (`ProgramService.programExists`, portfolio/program lookups) consumed by project-execution for soft-ref validation.

The unit stays **decoupled from project-execution's database** via a local read-model: `ProjectAlignmentProjector` subscribes to `project-execution.project.created` and `project-execution.project.status-changed` and maintains a `ProjectAlignmentView` projection (projectId, status, plannedBudget, portfolioId, aligned). Alignment (US-008/US-010) and investment-mix (US-009) read from this projection — never from execution's schema. When a project is activated with no `GoalLink`, `AlignmentService` sets `aligned=false` and publishes `strategy-portfolio.project.flagged-unaligned`. Event handling is idempotent (foundation idempotency ledger) and order-tolerant (`lastEventAt` guard); publications go through the foundation transactional outbox.

## Design Documents
### Compact core
- [components.md](design/components.md) — 6 services + ProjectAlignmentProjector, 5 repositories, 5 controllers, module wiring
- [data-model.md](design/data-model.md) — `strategy` schema: 6 models, 3 enums, soft-ref seams, indexes/uniques
- [api-spec.md](design/api-spec.md) — REST endpoints (`/api/v1/strategy/*`), Zod DTOs, RFC7807 error codes
- [integration.md](design/integration.md) — event subscriptions/publications, module-API surface, ACL soft-ref seam
- [implementation.md](design/implementation.md) — directory layout, migration, build order, DoD
- [nfr.md](design/nfr.md) — compact NFR (security, resiliency, performance)
- [correctness.md](design/correctness.md) — PBT properties (aggregation total-preserving, alignment exhaustive, link idempotent)

### Expanded deep dives
- [functional-design.md](design/functional-design.md) — domain model, 11 business rules (BR-101..BR-111) traced to stories
- [nfr-requirements.md](design/nfr-requirements.md) — measurable NFRs + tech-stack restatement
- [nfr-design.md](design/nfr-design.md) — security & resiliency patterns, logical components
- [infrastructure.md](design/infrastructure.md) — foundation-inherited deployment + `strategy` schema/migration

## Key Design Decisions (D3)
| Concern | Decision | Rationale |
|---------|----------|-----------|
| Framework / ORM / Schema | NestJS · Prisma multi-schema · `strategy` | Foundation-locked; one schema per unit |
| Project data read (D3-1) | Local read-model `ProjectAlignmentView` fed by execution events | Decouples units, fast reads, resilient; fits event-driven foundation |
| GoalLink ownership (D3-2) | `strategy` owns GoalLink (goalId FK + projectId soft ref) | Alignment is this unit's concern; execution stays goal-unaware |
| Portfolio↔Goal (D3-3) | Many-to-many via `PortfolioGoal` join | Reflects real EPMO governance |
| Alignment/unaligned (D3-4) | strategy-portfolio evaluates on project events; publishes flag; US-010 reads projection | Alignment ownership here; execution decoupled |
| Investment-mix (D3-5) | On-demand aggregation query over local projection (no materialized store) | Portfolio-scale data; simple and always fresh |
| Program hierarchy (D3-6) | `Program.portfolioId` required FK; Project→Program soft ref via module API | Consistent with project-execution soft-ref seam |
| PBT (D3-7) | Aggregation total-preserving · alignment exhaustive · link idempotent | property-based-testing extension (partial) |
| Events (D3-8) | Publishes 4 strategy events; subscribes project.created + project.status-changed | Matches units.md; enables projection |

## Traceability
| Story | Feature | Status |
|-------|---------|--------|
| US-006 | Define strategic goals/OKRs (Director) | In scope |
| US-007 | Create & manage portfolios; associate goals (owner=creator) | In scope |
| US-008 | Link project→goal(s); flag unaligned on activation | In scope |
| US-009 | Portfolio investment-mix view (count/planned-budget by goal & portfolio) | In scope |
| US-010 | Surface unaligned active work (Director report) | In scope |
| US-011 | Create & manage programs under a portfolio | In scope |

## References
- Parent: [units.md](../../units.md) · [requirements.md](../../requirements.md)
- Foundation design: [../foundation/design.md](../foundation/design.md) · Depends on project-execution (events) + identity-access (RBAC)
- D3 decisions: [../../../../workflow/epm-platform/units/strategy-portfolio/decisions-design.md](../../../../workflow/epm-platform/units/strategy-portfolio/decisions-design.md)
- Workflow: [../../../../workflow/epm-platform/aidlc-manifest.yaml](../../../../workflow/epm-platform/aidlc-manifest.yaml)
