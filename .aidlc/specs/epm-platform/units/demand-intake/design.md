# Design — Unit: demand-intake (expanded)

## Summary
- **Unit**: demand-intake (domain) · owner: Sophon
- **Stack**: NestJS (TS/Node 20) · Prisma + PostgreSQL (`intake` schema) · Zod · pino · in-process event bus · Vitest + fast-check · Docker (inherited from foundation)
- **Purpose**: Capture project demand, score against configurable weighted criteria, run stage-gate approval, and promote approved demand to a project
- **Stories**: US-029, US-030, US-031, US-032
- **Extensions enforced**: security-baseline ✅ · resiliency-baseline ✅ · property-based-testing (partial) ✅

## Architecture
`DemandIntakeModule` is a NestJS module mounted at `apps/api/src/modules/demand-intake/`. It owns the `intake` PostgreSQL schema (DemandRequest, ScoringModel, ScoringCriterion, ScoreCard, CriterionScore, GateDecision).

The demand pipeline is a service-layer state machine: **submit** (US-029) → **score** (US-030) → **stage-gate advance/reject** (US-031) → **promote** (US-032). Scoring uses a single active versioned `ScoringModel` of weighted criteria; a pure `ScoreCalculator` computes `weightedTotal = Σ(weightᵢ × scoreᵢ)/Σweightᵢ` normalized to 0–100 and ranks requests deterministically. The stage-gate is a fixed linear sequence `Submitted → Screening → Evaluation → Approved` with a per-gate RBAC check on each advance; rejection at any active gate is terminal with a recorded reason.

Promotion is **event-driven and reuses the already-wired seam**: `PromotionService` publishes `demand-intake.demand.promoted` with the exact payload project-execution's subscriber expects (`{demandId, name, portfolioId, programId?, plannedStart, plannedEnd, plannedBudget?}`); project-execution creates the Project idempotently (`sourceDemandId=demandId`). Because the intake form captures only title/sponsor/description/expectedValue, `PromoteToProject` accepts the portfolio + planned dates + budget from the PM at promotion time. Traceability rides on `sourceDemandId`. Strategic-fit scoring is decoupled: a criterion may carry an optional `goalId` soft ref (no runtime call into strategy-portfolio).

## Design Documents
### Compact core
- [components.md](design/components.md) — 6 services (incl. pure `ScoreCalculator`), 4 repositories, 5 controllers, module wiring
- [data-model.md](design/data-model.md) — `intake` schema: 6 models, 3 enums, soft refs, indexes/uniques
- [api-spec.md](design/api-spec.md) — REST endpoints (`/api/v1/intake/*`), Zod DTOs, RFC7807 error codes `DEMAND_001–007`
- [integration.md](design/integration.md) — promote seam (exact event contract), 4 published events, strategic-fit soft ref, per-gate RBAC
- [implementation.md](design/implementation.md) — directory layout, migration `0006_intake_init`, build order, DoD
- [nfr.md](design/nfr.md) — compact NFR (security, resiliency, performance)
- [correctness.md](design/correctness.md) — PBT properties (weighted-score bounded, ranking total-order, gate-transition validity)

### Expanded deep dives
- [functional-design.md](design/functional-design.md) — domain model, 10 business rules (BR-201..BR-210) traced to stories
- [nfr-requirements.md](design/nfr-requirements.md) — measurable NFRs + tech-stack restatement
- [nfr-design.md](design/nfr-design.md) — security & resiliency patterns, per-gate authorization, guarded gate transitions
- [infrastructure.md](design/infrastructure.md) — foundation-inherited deployment + `intake` schema/migration

## Key Design Decisions (D3)
| Concern | Decision | Rationale |
|---------|----------|-----------|
| Framework / ORM / Schema | NestJS · Prisma multi-schema · `intake` | Foundation-locked; one schema per unit |
| Strategic-fit seam (D3-1) | Manual per-criterion scoring; optional `goalId` soft ref, no runtime call | Decouples; matches AC (scores entered); doesn't touch completed strategy-portfolio |
| Promote (D3-2) | Event-driven `demand.promoted` (exact execution payload); PromoteToProject supplies portfolio+dates | Reuses already-wired idempotent seam; no re-keying; `sourceDemandId` traceability |
| Scoring (D3-3) | Single active versioned `ScoringModel` + weighted criteria; `weightedTotal=Σ(w×s)/Σw→0-100`; rank desc, stable tie-break | Objective, comparable, versionable |
| Stage-gate (D3-4) | Fixed linear `Submitted→Screening→Evaluation→Approved` + per-gate RBAC; reject terminal | MVP governance without over-engineering |
| Lifecycle (D3-5) | Submitted→Screening→Evaluation→Approved→Promoted (+Rejected terminal) | Clear, testable state machine |
| PBT (D3-6) | Weighted-score bounded/correct · ranking total-order · gate-transition validity | property-based-testing extension (partial) |
| Events (D3-7) | Publishes submitted/approved/rejected/promoted; subscribes none | Matches units.md; promote contract fixed by execution |

## Traceability
| Story | Feature | Status |
|-------|---------|--------|
| US-029 | Submit intake request (title/sponsor/description/expected value) | In scope |
| US-030 | Configurable weighted scoring + ranking | In scope |
| US-031 | Stage-gate approval workflow (per-gate RBAC, reject+reason) | In scope |
| US-032 | Promote approved demand to project (pre-populated, traceable) | In scope |

## References
- Parent: [units.md](../../units.md) · [requirements.md](../../requirements.md)
- Foundation design: [../foundation/design.md](../foundation/design.md) · Depends on strategy-portfolio (strategic-fit soft ref) + project-execution (promote event) + identity-access (RBAC)
- D3 decisions: [../../../../workflow/epm-platform/units/demand-intake/decisions-design.md](../../../../workflow/epm-platform/units/demand-intake/decisions-design.md)
- Workflow: [../../../../workflow/epm-platform/aidlc-manifest.yaml](../../../../workflow/epm-platform/aidlc-manifest.yaml)
