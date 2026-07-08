# Design Decisions (D3) — Unit: identity-access

## Context Summary
- **Unit**: identity-access (domain) · owner: Sophon · schema `identity`
- **Stories**: US-001 (SSO login), US-002 (RBAC roles), US-003 (record-level scoping), US-004 (audit trail), US-005 (session/timeout)
- **Inherited from foundation.md (SETTLED — the auth *mechanics* already exist)**: OIDC/JWT verify (`TokenVerifier`), global `AuthGuard` (deny-by-default), `RbacRegistry` (role→permission), `AuditService`, `canAccess`/record-scope logic, `@epm/shared` roles/permissions.
- **This unit adds the DATA + admin layer** on top of the foundation: user/role/permission/scope tables in the `identity` schema, provisioning, and the endpoints to manage them.
- **Extensions (blocking)**: security-baseline, resiliency-baseline, property-based-testing (partial)

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"**.

---

## Decision Questions

### D3-1: User provisioning from SSO
**Question**: How do users get into the system (US-001)?
- 1) **Just-in-time (JIT) — create/upsert the user in `identity.user` on first successful SSO login, from IdP claims** **(Recommended)**
- 2) Pre-provisioned only (admin creates users; SSO just authenticates known users)
- 3) Hybrid — JIT create as inactive, admin activates
- 4) Other (please specify): _______

**Answer**: 

---

### D3-2: Role → permission catalog source
**Question**: Where does the role→permission mapping live (US-002)?
- 1) **Seeded in `identity` schema (role, permission, role_permission tables) + loaded into the foundation `RbacRegistry` at boot** **(Recommended — DB is source of truth, registry is the fast in-memory cache)**
- 2) Hard-coded in code only (no DB table)
- 3) Fully dynamic/admin-editable at runtime
- 4) Other (please specify): _______

**Answer**: 

---

### D3-3: Record-scope storage & assignment
**Question**: How are per-user record scopes (US-003) stored?
- 1) **`identity.user_scope` table (userId, scopeType, scopeId | subtreeRootId); loaded into `AuthContext.recordScopes` at token/verify time** **(Recommended)**
- 2) Encode scopes as JWT claims from the IdP only (no local table)
- 3) Other (please specify): _______

**Answer**: 

---

### D3-4: Roles/scopes into the request context
**Question**: How do a user's roles + scopes reach `AuthContext` on each request?
- 1) **Resolve from the `identity` tables by `userId` (sub) at verify time, caching per request; IdP token supplies identity, DB supplies authz** **(Recommended — authz not delegated to IdP claims)**
- 2) Trust roles/scopes claims embedded in the IdP JWT
- 3) Hybrid (roles from IdP, scopes from DB)
- 4) Other (please specify): _______

**Answer**: 

---

### D3-5: Admin endpoints scope
**Question**: Which management endpoints does this unit expose (MVP)?
- 1) **Assign/revoke role (US-002), grant/revoke record scope (US-003), list users, view audit log (US-004) — all EPMO-Director-gated** **(Recommended)**
- 2) Role assignment only
- 3) Full user CRUD + role + scope + audit admin
- 4) Other (please specify): _______

**Answer**: 

---

### D3-6: Session & timeout (US-005)
**Question**: How is idle session timeout enforced?
- 1) **Short-lived access JWT (rely on `exp`) + refresh via foundation `/auth/refresh`; server rejects expired tokens (stateless)** **(Recommended)**
- 2) Server-side session store (Redis) with sliding expiry
- 3) Other (please specify): _______

**Answer**: 

---

### D3-7: Correctness & Property-Based Testing (MANDATORY)
**Question**: Which properties carry PBT for this unit (partial/blocking)?
- 1) **Yes — permission resolution (role set → effective permission set is the union of grants) + scope loading (DB rows → valid `RecordScope[]`, no drift from `@epm/shared` schema)** **(Recommended)**
- 2) Yes — permission resolution only
- 3) No PBT (defer)
- 4) Other (please specify): _______

**Answer**: 

---

## Decisions Summary
<!-- Answered via "use recommendations" 2026-07-07. -->
- D3-1 Provisioning: JIT — upsert `identity.user` on first SSO login from IdP claims
- D3-2 Role/permission source: Seeded `identity` tables (role, permission, role_permission) → loaded into foundation RbacRegistry at boot
- D3-3 Scope storage: `identity.user_scope` table → loaded into AuthContext.recordScopes
- D3-4 Context resolution: roles + scopes resolved from `identity` DB by userId (sub) at verify time (authz from DB, not IdP claims)
- D3-5 Admin endpoints: assign/revoke role, grant/revoke scope, list users, view audit — EPMO-Director-gated
- D3-6 Session/timeout: short-lived access JWT (exp) + refresh via foundation /auth/refresh (stateless)
- D3-7 PBT: permission resolution (union of grants) + scope loading (DB rows → valid RecordScope[])

---

## Validation Notes (D3)
- Consistent with foundation stack (NestJS/Prisma/OIDC/RBAC). No conflicts within the unit.
- **Cross-unit integration flag (for solutions-review)**: D3-4 moves authz resolution from IdP JWT claims → the `identity` DB. The foundation `TokenVerifier` currently builds `AuthContext` from claims. This unit must provide a `UserDirectory` service and the foundation auth needs a small **pluggable enricher hook** so `AuthContext` roles/scopes come from `identity`. That is a shared-foundation touch-point owned by the Tech Lead (Sophon) — coordinate via foundation change + solutions-review before implement.
- Extension enforcement: security (DB-driven authz + audit), resiliency (registry cached at boot, DB-down degradation), PBT (D3-7) — all addressed in design.

---

**Instructions**: Answers applied via "use recommendations".
