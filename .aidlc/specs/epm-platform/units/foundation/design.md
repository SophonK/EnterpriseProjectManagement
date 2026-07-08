# Design — Unit: foundation (expanded)

## Summary
- **Unit**: foundation (infrastructure) · owner: Sophon
- **Stack**: NestJS (TS/Node 20) · Prisma + PostgreSQL (schema per unit) · Zod · openid-client + jose · pino · lightweight in-process event bus · Vitest + fast-check + Testcontainers · Docker
- **Purpose**: shared scaffold + cross-cutting infrastructure all 7 domain units build on
- **Extensions enforced**: security-baseline ✅ · resiliency-baseline ✅ · property-based-testing (partial) ✅

## Architecture
Modular Monolith host (`apps/api`) with a `foundation/` layer (auth, errors, events, db, audit, config, logging, health) and shared packages (`@epm/shared`, `@epm/db`, `@epm/config`). Domain units are NestJS modules that depend on foundation providers; never the reverse. Single PostgreSQL, schema per unit; in-process module APIs + transactional-outbox domain events.

## Design Documents
### Compact core (consumed by tasks / implement / code-review)
- [components.md](design/components.md) — infra components + interfaces
- [data-model.md](design/data-model.md) — schema strategy + foundation-owned tables (audit, outbox, ledger)
- [api-spec.md](design/api-spec.md) — /health, /auth/*, cross-cutting conventions, error codes
- [integration.md](design/integration.md) — OIDC IdP + in-process seams
- [implementation.md](design/implementation.md) — directory structure + build order + DoD
- [nfr.md](design/nfr.md) — compact NFR (security + resiliency)
- [correctness.md](design/correctness.md) — PBT properties (P1–P5)

### Expanded deep dives
- [functional-design.md](design/functional-design.md) — authorization/eventing/error/audit logic, entities, business rules
- [nfr-requirements.md](design/nfr-requirements.md) — measurable NFRs (SEC/REL/PERF/AVL/OBS)
- [nfr-design.md](design/nfr-design.md) — security & resilience patterns, logical components, request lifecycle
- [infrastructure.md](design/infrastructure.md) — deployment architecture, component→service mapping, CI/CD, rollback

## Traceability
Foundation carries no user stories (cross-cutting). It enables every domain unit's stories by providing: SSO/JWT (US-001), RBAC + record scoping (US-002/003), audit trail (US-004), session/timeout (US-005), and the shared error/event/validation/DB conventions all other stories rely on.

## References
- Parent: [foundation.md](../../foundation.md) · [units.md](../../units.md) · [requirements.md](../../requirements.md)
- Decisions: [decisions-design.md](../../../workflow/epm-platform/units/foundation/decisions-design.md)
