# identity-access — NFR (compact)

## Security (security-baseline — blocking)
- **DB-driven authz**: roles/scopes resolved from `identity` DB, not trusted from IdP claims (reduces token-tampering surface).
- **Admin endpoints Director-gated**: every `/api/v1/identity/*` mutation requires an `identity:*` permission held only by EPMO Director; enforced by the foundation AuthGuard (`@RequirePermission`).
- **Audit**: every role/scope grant/revoke is recorded immutably (actor, target user, before/after) within the same transaction (SEC-3).
- **Least privilege**: JIT users are created with no roles/scopes by default — access is explicitly granted.
- **Input validation**: Zod DTOs for role/scope operations; scope must satisfy `recordScopeSchema`.

## Resiliency (resiliency-baseline — blocking, directional)
- **RBAC cache at boot**: registry loaded from DB once; runtime authz does not hit the DB for role→permission (fast + resilient to brief DB blips).
- **Enricher failure handling**: if per-request scope resolution fails, fail **closed** (treat as no scopes → deny), never fail open.
- **JIT via event**: login-provisioning is event-driven + idempotent (reuses foundation outbox/idempotency), so a transient failure doesn't block login.

## Performance
- `resolveRoles`/`resolveScopes` are indexed lookups by `userId`; consider a short per-request cache. Registry lookups are in-memory O(1).

## Maintainability
- Reuses `@epm/shared` `Role`/`Permission`/`RecordScope` + `recordScopeSchema` (no local redefinition).
- Foundation enricher hook keeps auth mechanics in one place; this unit only supplies data.
