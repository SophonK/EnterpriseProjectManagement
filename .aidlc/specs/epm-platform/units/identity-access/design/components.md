# identity-access — Components

Domain unit adding the user/role/permission/scope **data + admin layer** on top of the
foundation auth mechanics. NestJS module `apps/api/src/modules/identity-access/`.

## Component Map

| Component | Responsibility | Depends on (foundation) |
|---|---|---|
| **UserProvisioningService** | JIT upsert `identity.user` from IdP claims on first login (US-001) | PrismaService |
| **UserDirectoryService** | Resolve a user's effective roles + record scopes by `userId` (sub) | PrismaService |
| **AuthContextEnricher** | Implements the foundation enricher hook — replaces JWT-claim roles/scopes with DB-resolved ones (D3-4) | foundation auth hook |
| **RbacBootstrapService** | On boot, load `role_permission` rows into the foundation `RbacRegistry` | RbacRegistry |
| **RoleAdminService** | Assign/revoke roles to users (US-002) | PrismaService, AuditService |
| **ScopeAdminService** | Grant/revoke record scopes (US-003) | PrismaService, AuditService |
| **IdentityAdminController** | REST endpoints for the above + list users + view audit (US-002/003/004), Director-gated | AuthGuard, RbacRegistry |
| **IdentityRepository** | `identity`-schema data access (extends foundation BaseRepository) | PrismaService, BaseRepository |

## Key Interfaces
```ts
// Foundation hook (added to foundation/auth — Tech-Lead coordinated):
interface AuthContextEnricher {
  enrich(userId: string, claims: JWTClaims): Promise<{ roles: Role[]; recordScopes: RecordScope[] }>;
}

// identity-access implementation:
class UserDirectoryService {
  resolveRoles(userId: string): Promise<Role[]>;
  resolveScopes(userId: string): Promise<RecordScope[]>;
}
```

## Notes
- Auth **mechanics** (OIDC, JWT verify, guard, canAccess, audit) come from foundation — this unit supplies the **data** those mechanics operate on.
- All admin endpoints require the EPMO Director permission set (`identity:*`).
