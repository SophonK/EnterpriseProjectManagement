# identity-access — Integration

## Foundation integration (⚠️ shared touch-point — Tech-Lead coordinated)

### AuthContext enricher hook (D3-4)
The foundation currently builds `AuthContext` from JWT claims (`TokenVerifier.toAuthContext`).
This unit changes authz to be **DB-driven**. Required foundation change:

1. Add an optional token `AUTH_CONTEXT_ENRICHER` in `foundation/auth` with interface:
   ```ts
   interface AuthContextEnricher {
     enrich(userId: string, claims: JWTClaims): Promise<{ roles: Role[]; recordScopes: RecordScope[] }>;
   }
   ```
2. `TokenVerifier.verify` — after signature verification, if an enricher is bound, use it to
   populate `roles`/`recordScopes` instead of the raw claims (fall back to claims if unbound).
3. identity-access binds `UserDirectoryService` as the enricher.

**Coordination**: this is a small, additive, backward-compatible foundation change owned by the
Tech Lead (Sophon). Must pass **solutions-review** before implement. Tracked as the cross-unit item.

### RBAC bootstrap
On `onModuleInit`, `RbacBootstrapService` loads `role_permission` rows and calls
`RbacRegistry.grant(role, ...permissions)` so the in-memory registry mirrors the DB (resiliency:
cached at boot; DB-down at runtime does not break already-loaded authz).

### JIT provisioning
On the OIDC callback (foundation `AuthController`), call `UserProvisioningService.upsertFromClaims`
(another small foundation hook or an event `identity.user.provisioned`). Prefer an event: foundation
publishes `auth.login.succeeded` → identity-access subscribes and upserts (keeps foundation decoupled).

## External
- Enterprise IdP: consumed indirectly (claims arrive via foundation OIDC). No direct IdP calls here.
- HR system (Phase 2): future source for user master data — not in MVP.

## Events
- **Subscribes**: `auth.login.succeeded` (from foundation) → JIT upsert.
- **Publishes**: `identity.role.assigned`, `identity.scope.granted` (audit/notification consumers later).
