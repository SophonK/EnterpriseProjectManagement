# Design — Unit: resource-management (expanded)

## Summary
- **Unit**: resource-management (domain) · owner: Chavakorn
- **Stack**: NestJS (TS/Node 20) · Prisma + PostgreSQL (`resource` schema) · Zod · pino · in-process event bus · Vitest + fast-check · Docker (inherited from foundation)
- **Purpose**: Resources & skills, percentage allocation over periods, utilization, over-allocation detection, and capacity-vs-demand analysis
- **Stories**: US-020, US-021, US-022, US-023, US-024
- **Extensions enforced**: security-baseline ✅ · resiliency-baseline ✅ · property-based-testing (partial) ✅

## Architecture
`ResourceManagementModule` is a NestJS module mounted at `apps/api/src/modules/resource-management/`. It owns the `resource` PostgreSQL schema. Allocation math (over-allocation detection, utilization bands, capacity-vs-demand gap) is the core domain logic; it is covered by PBT. Over-allocation is evaluated synchronously on every create/update allocation call and also published as a `ResourceOverAllocated` domain event for downstream consumers. The module exposes `ResourceService` and `AllocationService` as in-process APIs for reporting-dashboards.

## Design Documents
### Compact core
- [components.md](design/components.md) — module components, service interfaces, repositories
- [data-model.md](design/data-model.md) — `resource` schema: tables, constraints, indexes
- [api-spec.md](design/api-spec.md) — REST endpoints, request/response shapes, error codes
- [integration.md](design/integration.md) — in-process seams: project-execution (project ref), identity-access (RBAC), reporting-dashboards (pub)
- [implementation.md](design/implementation.md) — directory layout, build order, DoD
- [nfr.md](design/nfr.md) — compact NFR (security, resiliency)
- [correctness.md](design/correctness.md) — PBT properties (allocation math total, over-allocation detection, utilization banding)

### Expanded deep dives
- [functional-design.md](design/functional-design.md) — aggregates, business rules, overlap algorithm, utilization bands
- [nfr-requirements.md](design/nfr-requirements.md) — measurable NFRs
- [nfr-design.md](design/nfr-design.md) — security & resiliency patterns

## Key Design Decisions
| Concern | Decision | Rationale |
|---------|----------|-----------|
| Framework | NestJS (locked) | Foundation decision |
| ORM | Prisma multi-schema (locked) | Foundation decision |
| Schema | `resource` | One schema per unit; isolates migrations |
| Over-allocation check | Synchronous sum query on overlapping periods; publish event if >100% | Immediate feedback to caller + async signal for dashboards |
| Period model | Calendar-month buckets stored as `periodStart` (first day of month) | Simplifies overlap query; consistent with capacity view |
| Utilization band | Green <80%, Amber 80–100%, Red >100% | Standard industry banding; matches product requirement |
| Capacity unit | FTE-equivalent % per period (0–100+ per person) | Matches US-021 "percentage allocation"; avoids hours conversion for MVP |
| Project reference | Soft FK: `projectId` string, no Prisma relation to execution schema | Cross-schema; validated via ProjectService.getProject() call at write time |
| Over-allocation save | Allow with warning flag (`overAllocated` bool) after explicit confirm | US-022 AC2 — manager may override |
| PBT coverage | Allocation sum across overlapping periods, utilization band boundaries | property-based-testing extension (partial) |

## Traceability
| Story | Feature | Status |
|-------|---------|--------|
| US-020 | Create/update resource with skills & capacity per period | In scope |
| US-021 | Allocate resource to project by % over a date range | In scope |
| US-022 | Over-allocation warning (>100% in any period); confirm-and-save override | In scope |
| US-023 | Utilization heatmap per pool/period with banding | In scope |
| US-024 | Capacity-vs-demand: total capacity vs total allocated per pool/skill/period | In scope |

## References
- Parent: [units.md](../../units.md) · [requirements.md](../../requirements.md)
- Foundation design: [../foundation/design.md](../foundation/design.md)
- project-execution design: [../project-execution/design.md](../project-execution/design.md)
- Workflow: [../../../../workflow/epm-platform/aidlc-manifest.yaml](../../../../workflow/epm-platform/aidlc-manifest.yaml)
