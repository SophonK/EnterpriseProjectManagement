# identity-access — NFR Design (expanded)

How the NFR requirements are realized as patterns + logical components.

## Security Patterns
| Requirement | Pattern / Mechanism |
|---|---|
| IA-SEC-1 | **Enricher pattern**: `AuthContextEnricher` (bound in foundation) replaces claim-derived roles/scopes with DB-resolved ones during `TokenVerifier.verify`. Claims establish *identity*; DB establishes *authority*. |
| IA-SEC-2 | `@RequirePermission('identity:*')` on every admin route; foundation AuthGuard enforces (deny-by-default). |
| IA-SEC-3 | **Transactional audit**: admin services wrap mutation + `AuditService.record` in one `prisma.$transaction`. |
| IA-SEC-4 | Provisioning creates User only; grants are separate explicit operations. |
| IA-SEC-5 | Zod `recordScopeSchema` at the DTO boundary; invalid → 400 before persistence. |

## Resiliency Patterns
| Requirement | Pattern / Mechanism |
|---|---|
| IA-REL-1 | **Cache-at-boot**: `RbacBootstrapService.onModuleInit` loads `role_permission` → `RbacRegistry` (in-memory). |
| IA-REL-2 | **Fail-closed**: resolver try/catch → return `[]` (no roles/scopes) → guard denies; error logged, request not 500'd into an open state. |
| IA-REL-3 | **Event-driven provisioning**: subscribe `auth.login.succeeded`; idempotent upsert via foundation ledger; login path never blocks on provisioning. |
| IA-REL-4 | **Reload endpoint/command** (Director-gated) re-runs bootstrap to pick up grant changes without redeploy. |

## Logical Components
| Component | Type | Purpose |
|---|---|---|
| AuthContextEnricher | Provider (foundation-bound) | DB authz resolution per request |
| UserDirectoryService | Provider | resolveRoles / resolveScopes |
| RbacBootstrapService | Lifecycle (OnModuleInit) | seed registry from DB |
| Role/ScopeAdminService | Provider | audited mutations in tx |
| Login subscriber | Event handler | JIT provisioning |
| IdentityAdminController | Controller | Director-gated admin API |

## Data-Flow — authorized request
```
Request + JWT
  → foundation TokenVerifier: verify signature (JWKS)
  → AuthContextEnricher.enrich(sub, claims)
        → UserDirectoryService.resolveRoles/Scopes (identity DB, indexed)
        → on error: [] (fail-closed)
  → AuthContext { userId, roles(DB), recordScopes(DB) }
  → AuthGuard: RbacRegistry.permitted + canAccess
  → handler
```

## Trade-offs
- Per-request DB resolution adds latency vs. trusting claims; mitigated by indexed lookups + optional per-request cache, and justified by not trusting client-supplied authority (IA-SEC-1).
- Registry cached at boot means grant changes need a reload (IA-REL-4) — acceptable for infrequently-changing role→permission maps; per-user roles/scopes are always live from DB.
