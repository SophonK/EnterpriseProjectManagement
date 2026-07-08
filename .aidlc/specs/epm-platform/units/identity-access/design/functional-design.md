# identity-access — Functional Design (expanded)

Deep dive over components.md + data-model.md. The unit's business logic is: provisioning
identities, resolving authorization data, and administering roles/scopes — all audited.

## 1. Business-Logic Model

### 1.1 JIT provisioning (US-001)
```
onLoginSucceeded(claims):
  user = upsert identity.user by subject=claims.sub
         (set email, displayName; create as active with NO roles/scopes)
  emit identity.user.provisioned
```
- Idempotent (upsert by unique `subject`); driven by the `auth.login.succeeded` event (at-least-once + idempotency ledger).

### 1.2 Authorization resolution (US-002/003, D3-4)
```
enrich(userId, claims):
  roles  = resolveRoles(userId)   // user_role → Role[]
  scopes = resolveScopes(userId)  // user_scope → RecordScope[] (schema-validated, invalid dropped)
  return { roles, scopes }        // used to build AuthContext; NOT taken from claims
```
- `effectivePermissions = ∪ grants(role)` via the RbacRegistry (loaded from DB at boot).

### 1.3 Role administration (US-002)
```
assignRole(actor, userId, role):
  require actor has identity:assign-role
  tx: insert user_role (ignore if exists) ; audit(create, user_role, before=∅, after={userId,role}, actor)
  emit identity.role.assigned
revokeRole(actor, userId, role):
  tx: delete user_role ; audit(delete, ...)
```

### 1.4 Scope administration (US-003)
```
grantScope(actor, userId, scope):
  require actor has identity:grant-scope ; validate scope (recordScopeSchema)
  tx: insert user_scope ; audit(create, user_scope, after=scope, actor)
revokeScope(actor, userId, scopeId): tx delete + audit(delete)
```

### 1.5 Audit viewing (US-004)
```
listAudit(actor, filter): require identity:view-audit ; read shared.audit_log (paginated, filtered)
```

## 2. Domain Entities
| Entity | Key fields | Rules |
|---|---|---|
| User | id, subject(unique), email, displayName, status | JIT-created active, no default authz |
| Role | key ∈ ROLES | seeded |
| Permission | key `[domain]:[action]` | seeded per unit |
| UserRole | (userId, roleId) PK | set semantics (no dup) |
| UserScope | userId, type, scopeId?/subtreeRootId? | one of the two ids required |

## 3. Business Rules
- BR-IA-1: Deny-by-default — a new user has no roles/scopes; access is explicitly granted.
- BR-IA-2: Authorization data comes from the `identity` DB, never trusted from IdP claims (D3-4).
- BR-IA-3: Every role/scope mutation is audited in the same transaction (SEC-3).
- BR-IA-4: All admin ops require the corresponding `identity:*` permission (Director).
- BR-IA-5: Scope rows failing `recordScopeSchema` are dropped (fail-closed), never coerced.
- BR-IA-6: RbacRegistry mirrors the DB `role_permission` as of boot; changes require a reload.

## 4. Validation
Zod DTOs (`@epm/shared` schemas) for assign-role (role ∈ ROLES), grant-scope (`recordScopeSchema`),
and list queries (pagination bounds). Failures → `VALIDATION_001`.

> No frontend components in this unit (admin UI lives in the separate web repo, consuming these APIs).
