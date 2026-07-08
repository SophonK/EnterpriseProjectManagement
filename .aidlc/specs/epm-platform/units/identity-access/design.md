# Design — Unit: identity-access (expanded)

## Summary
- **Unit**: identity-access (domain) · owner: Sophon · schema `identity`
- **Purpose**: user/role/permission/scope **data + admin layer** on top of the foundation auth mechanics
- **Stack**: inherited (NestJS · Prisma `identity` schema · Zod · foundation AuthGuard/RbacRegistry/AuditService/EventBus)
- **Stories**: US-001 (SSO/JIT), US-002 (roles), US-003 (scopes), US-004 (audit view), US-005 (session)
- **Extensions**: security-baseline ✅ · resiliency-baseline ✅ · property-based-testing ✅

## Architecture
NestJS module `modules/identity-access/`. Identity comes from the IdP (via foundation OIDC); **authority
comes from the `identity` DB** — an `AuthContextEnricher` (bound into the foundation `TokenVerifier`)
resolves roles/scopes per request. RBAC role→permission is cached in the foundation `RbacRegistry` at
boot. Admin endpoints are Director-gated and audited transactionally.

## ⚠️ Cross-unit / foundation touch-points (solutions-review + Tech-Lead)
1. Add `AuthContextEnricher` hook to `foundation/auth` `TokenVerifier` (DB-driven authz; backward-compatible fallback to claims).
2. Foundation publishes `auth.login.succeeded` → identity-access subscribes for JIT provisioning.

## Design Documents
### Compact core (for tasks / implement / code-review)
- [components.md](design/components.md) · [data-model.md](design/data-model.md) · [api-spec.md](design/api-spec.md) · [integration.md](design/integration.md) · [implementation.md](design/implementation.md) · [nfr.md](design/nfr.md) · [correctness.md](design/correctness.md)
### Expanded deep dives
- [functional-design.md](design/functional-design.md) · [nfr-requirements.md](design/nfr-requirements.md) · [nfr-design.md](design/nfr-design.md) · [infrastructure.md](design/infrastructure.md)

## Traceability
US-001 → JIT provisioning; US-002 → role admin + RBAC; US-003 → scope admin + record-scope resolution;
US-004 → audit view; US-005 → stateless JWT + refresh (foundation).

## References
Parent: [foundation.md](../../foundation.md) · [units.md](../../units.md) · Decisions: [decisions-design.md](../../../workflow/epm-platform/units/identity-access/decisions-design.md)
