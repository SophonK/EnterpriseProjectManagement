# Solutions Review — epm-platform

## Resolution Log (updated 2026-07-07)
| ID | Status | Note |
|---|---|---|
| SR-CR-1 | ✅ Resolved | Foundation gained `AuthContextEnricher` hook (optional, backward-compatible); `TokenVerifier` uses it. Merged to `main` (commit ebdb1fe). api typecheck ✅, tests 17/17 ✅. |
| SR-MJ-2 | ✅ Resolved | `AuthController.callback` now publishes `auth.login.succeeded` (same change). |
| SR-MJ-1 | ⏳ Open — needs Chavakorn | Shared `ScopedRef.ancestorIds` subtree contract — add to `@epm/shared` + adopt in project-execution design. |
| SR-MN-1 | ⏳ Open | Document permission-namespace convention in foundation.md. |
| SR-MN-2 | ⏳ Open | Centralize RBAC registry bootstrap. |

---

## Review Summary
- **Date**: 2026-07-07
- **Units Reviewed**: identity-access (full design) vs. **foundation** baseline + shared auth contract
- **Scope note**: project-execution has only a D3 gate (no design yet — pending Chavakorn's session on its branch), so a full identity↔project-execution conflict review is deferred. This pass focuses on **foundation compliance** and the **cross-cutting auth/scope contract** that every unit consumes.
- **Alignment Status**: Partially Aligned
- **Issues**: 1 critical, 2 major, 2 minor

## Findings

### 🔴 Critical Issues

#### SR-CR-1: identity-access requires additive changes to the shared foundation before it can implement
**Affected Units**: identity-access, **foundation** (shared), and transitively all units' auth
**Category**: Integration
**Description**: identity-access design (D3-4) moves authorization resolution from IdP JWT claims to the `identity` DB. It needs two foundation changes: (a) an `AuthContextEnricher` hook in `TokenVerifier`, and (b) a published `auth.login.succeeded` event for JIT provisioning. Neither exists in the current foundation. identity-access cannot fully implement until these land.
**Impact**: Blocks identity-access implement; because it touches shared `foundation/auth`, an uncoordinated change could affect every unit's request path.
**Recommendation**: Tech Lead (Sophon) makes a **small, additive, backward-compatible** foundation change FIRST, as its own PR to main, then identity-access builds on it:
- `TokenVerifier`: accept an optional injected `AuthContextEnricher`; if bound, use it for roles/scopes; if unbound, fall back to today's claim-based behavior (no breakage for other units).
- Foundation `AuthController` (callback) publishes `auth.login.succeeded` via the existing event bus/outbox.
**Alternatives**: Keep authz from IdP claims (drop DB-driven authz) — weaker security posture; not recommended.
**Effort**: small.

### 🟡 Major Issues

#### SR-MJ-1: Subtree record-scope contract must be shared, or hierarchical scoping silently fails
**Affected Units**: identity-access (scope storage/resolution), project-execution + all record-scoped units
**Category**: Integration / Contract
**Description**: identity stores scopes as `{type, scopeId | subtreeRootId}` and `canAccess`/`scopeCovers` (in `@epm/shared`) matches a `subtreeRootId` against a record's `ancestorIds`. For a Director-granted portfolio-subtree scope to authorize a *project*, the consuming unit (project-execution) must populate `ScopedRef.ancestorIds` with the project's portfolio/program ids when it builds the record reference. If a unit omits `ancestorIds`, subtree grants won't match → legitimate access denied.
**Impact**: Silent authorization gaps for hierarchical scopes across every record-scoped unit.
**Recommendation**: Document a shared contract (in foundation.md / `@epm/shared`): "any `ScopedRef` for a hierarchical resource MUST include `ancestorIds` (root→parent)." Provide a small helper in `@epm/shared` to build a `ScopedRef` from a hierarchy. project-execution's design must adopt it.
**Effort**: small.

#### SR-MJ-2: Consumer-without-producer until foundation emits the login event
**Affected Units**: identity-access (subscriber), foundation (producer)
**Category**: Integration
**Description**: identity-access subscribes to `auth.login.succeeded`, but no unit currently publishes it. Until SR-CR-1(b) lands, JIT provisioning never fires.
**Impact**: Users authenticate but are never created in `identity` → no roles resolvable → everyone denied.
**Recommendation**: Ensure SR-CR-1(b) is implemented in the same foundation PR; add a foundation test asserting the event is published on successful callback.
**Effort**: trivial (bundled with SR-CR-1).

### 🟢 Minor Issues

#### SR-MN-1: Permission namespace convention should be stated once
**Affected Units**: all
**Category**: Duplication / Convention
**Description**: identity uses `identity:*`; project-execution will use `project:*`, etc. This is consistent with the `@epm/shared` `Permission` type, but the "one namespace per unit, `[domain]:[action]`" rule isn't written down.
**Recommendation**: Add the convention to foundation.md so units don't collide or diverge (e.g., `resource:*`, `risk:*`).
**Effort**: trivial.

#### SR-MN-2: RBAC registry reload path is per-unit; centralize the trigger
**Affected Units**: identity-access, foundation
**Category**: Consistency
**Description**: identity loads `role_permission` into the registry at boot and proposes a reload path. Other units also seed their own grants at boot. The reload/seed ordering should be centrally coordinated (one bootstrap sequence) to avoid partial registries.
**Recommendation**: A single foundation-level bootstrap phase that invokes each unit's grant registration deterministically.
**Effort**: small.

## Recommendations

### Immediate Actions (Before Implementation)
1. **SR-CR-1**: Tech Lead lands the additive foundation change (enricher hook + login event) as a standalone PR to main; keep it backward-compatible.
2. **SR-MJ-2**: bundle the login-event producer + a test into that same PR.

### Design Refinements (Should Do)
1. **SR-MJ-1**: add the `ScopedRef.ancestorIds` contract + helper to `@epm/shared`; have project-execution adopt it in its design.

### Consolidation Opportunities (Nice to Have)
1. **SR-MN-1**: document the permission-namespace convention in foundation.md.
2. **SR-MN-2**: centralize RBAC registry bootstrap.

## Conclusion
**Go/No-Go**: **Conditional Go** — identity-access design is sound and foundation-compliant, but implementation is blocked until the additive foundation change (SR-CR-1, incl. SR-MJ-2) lands. SR-MJ-1 should be settled as a shared contract before project-execution finalizes its design. No fundamental misalignment — a redesign is not needed.

*Full identity-access ↔ project-execution conflict review to run once project-execution's design is generated and pushed.*
