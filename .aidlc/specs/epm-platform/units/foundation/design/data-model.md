# Foundation — Data Model

The foundation owns cross-cutting tables and the schema-per-unit setup. Domain entities live in their own units' schemas.

## Schema Strategy
- One PostgreSQL database; one schema per unit: `identity`, `strategy`, `execution`, `resource`, `risk`, `intake`, `reporting`, plus `shared` for foundation-owned cross-cutting tables.
- Prisma multi-schema (`schemas = [...]`). No cross-schema writes; cross-schema reads only for `reporting`.
- Conventions: UUID v4 PKs, `createdAt`/`updatedAt` (ISO 8601 UTC, `timestamptz`), soft delete via nullable `deletedAt`.

## Foundation-Owned Tables (`shared` schema)

### audit_log
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| actor_id | uuid | user who acted (nullable for system) |
| action | text | create/update/delete/access_denied |
| entity_type | text | e.g. "project" |
| entity_id | uuid | nullable |
| before | jsonb | nullable |
| after | jsonb | nullable |
| request_id | text | correlation id |
| occurred_at | timestamptz | default now() |

Immutable: no UPDATE/DELETE grants via the app role.

### outbox (event durability — optional, supports at-least-once)
| Column | Type | Notes |
|---|---|---|
| event_id | uuid PK | |
| event_type | text | `[unit].[entity].[action]` |
| payload | jsonb | serialized `DomainEvent<T>` |
| occurred_at | timestamptz | |
| processed_at | timestamptz | nullable |

### processed_events (idempotency ledger)
| Column | Type | Notes |
|---|---|---|
| event_id | uuid PK | consumed once |
| handler | text | PK part (event_id + handler) |
| processed_at | timestamptz | |

## Migration Layout (`packages/db`)
```
packages/db/prisma/
├── schema.prisma            # datasource + generator + schemas[]
├── migrations/              # Prisma Migrate history
└── seed.ts                  # baseline roles/permissions seed (identity consumes)
```

## Notes
- `users`, `roles`, `permissions` are owned by **identity-access** (schema `identity`) — foundation provides the `AuthContext` contract and the audit sink, not the identity tables.
- Foundation seeds the RBAC role catalog reference so units can validate roles.
