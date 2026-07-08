# identity-access — Data Model (`identity` schema)

Conventions inherited from foundation: UUID v4 PKs, `timestamptz` ISO-8601 UTC, soft delete `deletedAt`.

## Tables

### user
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| subject | text unique | IdP `sub` claim (SSO identity) |
| email | text unique | from claims |
| displayName | text | from claims |
| status | text | active \| inactive (JIT creates active) |
| createdAt / updatedAt / deletedAt | timestamptz | |

### role
| id uuid PK · key text unique (one of the 8 ROLES) · description text |

### permission
| id uuid PK · key text unique (`[domain]:[action]`) · description text |

### role_permission (M:N)
| roleId uuid FK→role · permissionId uuid FK→permission · PK(roleId, permissionId) |

### user_role (M:N)
| userId uuid FK→user · roleId uuid FK→role · grantedBy uuid · grantedAt timestamptz · PK(userId, roleId) |

### user_scope
| id uuid PK · userId uuid FK→user · scopeType text (portfolio\|program\|project\|resource-pool) · scopeId uuid null · subtreeRootId uuid null · grantedBy uuid · grantedAt timestamptz |
| CHECK (scopeId IS NOT NULL OR subtreeRootId IS NOT NULL) |

## Seed (baseline)
- 8 `role` rows (the ROLES enum from @epm/shared).
- `permission` rows for identity admin: `identity:assign-role`, `identity:grant-scope`, `identity:list-users`, `identity:view-audit`.
- `role_permission`: grant the four `identity:*` permissions to EPMO_DIRECTOR.
- (Each domain unit seeds its own permissions/grants for its resources.)

## Relationships → AuthContext
- `user_role` → `AuthContext.roles`
- `user_scope` → `AuthContext.recordScopes` (validated against `@epm/shared` `recordScopeSchema`)

## Prisma
All models `@@schema("identity")`. FKs stay within the `identity` schema (no cross-schema FK).
