# identity-access — Implementation Plan

## Directory
```
apps/api/src/modules/identity-access/
├── identity-access.module.ts      # wires providers + controller; binds enricher; RBAC bootstrap
├── identity.repository.ts         # extends foundation BaseRepository (schema "identity")
├── user-provisioning.service.ts   # JIT upsert from claims (US-001)
├── user-directory.service.ts      # resolveRoles / resolveScopes (feeds AuthContext)
├── auth-context-enricher.ts       # implements foundation AuthContextEnricher hook
├── rbac-bootstrap.service.ts      # load role_permission → RbacRegistry (onModuleInit)
├── role-admin.service.ts          # assign/revoke role (US-002)
├── scope-admin.service.ts         # grant/revoke scope (US-003)
├── identity-admin.controller.ts   # /api/v1/identity/* endpoints
└── dto/                           # Zod schemas (assign-role, grant-scope, list-query)
packages/db/prisma/schema.prisma   # + identity models (migration 0003_identity)
```

## Build order (feeds task waves)
1. Prisma models for `identity` schema (user, role, permission, role_permission, user_role, user_scope) + migration `0003_identity` + seed (roles, identity permissions, Director grants)
2. IdentityRepository + DTOs/Zod schemas
3. UserDirectoryService (resolveRoles/resolveScopes) + PBT (permission union, scope loading)
4. Foundation change (Tech-Lead): `AuthContextEnricher` hook + `auth.login.succeeded` event — **after solutions-review**
5. AuthContextEnricher (binds UserDirectoryService) + UserProvisioningService (subscribe login event)
6. RbacBootstrapService (onModuleInit load grants)
7. RoleAdminService + ScopeAdminService (audited, transactional)
8. IdentityAdminController (Director-gated endpoints) + integration tests
9. Wire IdentityAccessModule into AppModule

## Conventions
Follow foundation.md: RFC 7807, Zod validation, audited state changes, `@RequirePermission`, in-schema FKs only, PBT for pure logic.

## Definition of Done
Migration applies; RBAC registry seeded from DB at boot; admin endpoints Director-gated + audited; roles/scopes resolved from DB into AuthContext; PBT green; unit + integration tests pass.
