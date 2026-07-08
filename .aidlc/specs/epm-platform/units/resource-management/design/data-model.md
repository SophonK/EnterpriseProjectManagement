# Data Model — resource-management

## PostgreSQL schema: `resource`

### Table: `resource.resource`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `name` | `varchar(200)` | NOT NULL | |
| `email` | `varchar(320)` | NOT NULL, UNIQUE | |
| `pool_id` | `uuid` | NOT NULL, FK → `resource.pool` | |
| `fte_capacity` | `numeric(5,2)` | NOT NULL, CHECK >0 | Default FTE capacity per period if no override |
| `over_allocated` | `boolean` | NOT NULL, DEFAULT false | Materialised flag; recomputed on each allocation write |
| `created_by` | `varchar(36)` | NOT NULL | userId |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL | |

### Table: `resource.pool`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `name` | `varchar(200)` | NOT NULL, UNIQUE | e.g. "Engineering", "Design" |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL | |

### Table: `resource.skill`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `resource_id` | `uuid` | NOT NULL, FK → `resource.resource` CASCADE | |
| `name` | `varchar(100)` | NOT NULL | e.g. "React", "Java" |
| `level` | `varchar(20)` | NOT NULL | `Beginner / Intermediate / Expert` |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | |

Unique: `(resource_id, name)`

### Table: `resource.capacity_period`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `resource_id` | `uuid` | NOT NULL, FK → `resource.resource` CASCADE | |
| `period_start` | `date` | NOT NULL | First day of month |
| `capacity_pct` | `numeric(5,2)` | NOT NULL, CHECK 0 < x ≤ 100 | Overrides `resource.fte_capacity` for this month |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL | |

Unique: `(resource_id, period_start)`

### Table: `resource.allocation`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `resource_id` | `uuid` | NOT NULL, FK → `resource.resource` CASCADE | |
| `project_id` | `varchar(36)` | NOT NULL | Soft FK — validated via ProjectService |
| `period_start` | `date` | NOT NULL | First day of first month of allocation |
| `period_end` | `date` | NOT NULL | First day of last month (inclusive) |
| `allocation_pct` | `numeric(5,2)` | NOT NULL, CHECK 0 < x ≤ 200 | Per-period % (can exceed 100 if manager confirms) |
| `over_allocated_confirmed` | `boolean` | NOT NULL, DEFAULT false | True when manager explicitly confirmed over-alloc |
| `created_by` | `varchar(36)` | NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL | |

CHECK: `period_end >= period_start`
Index: `(resource_id, period_start, period_end)` — overlap query

## Overlap / Utilization Query Pattern

To find total allocation % for a resource in month M:
```sql
SELECT COALESCE(SUM(allocation_pct), 0)
FROM resource.allocation
WHERE resource_id = $1
  AND period_start <= $2   -- $2 = first day of month M
  AND period_end   >= $2
```

Utilization for heatmap: run above for each (resource_id, month) in the requested range.

## Prisma models (schema `resource`)

```prisma
model ResourcePool {
  id         String     @id @default(uuid())
  name       String     @unique @db.VarChar(200)
  resources  Resource[]
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
  @@schema("resource")
}

model Resource {
  id             String           @id @default(uuid())
  name           String           @db.VarChar(200)
  email          String           @unique @db.VarChar(320)
  poolId         String
  pool           ResourcePool     @relation(fields: [poolId], references: [id])
  fteCapacity    Decimal          @db.Decimal(5, 2)
  overAllocated  Boolean          @default(false)
  skills         Skill[]
  capacityPeriods CapacityPeriod[]
  allocations    Allocation[]
  createdBy      String           @db.VarChar(36)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  @@schema("resource")
}

model Skill {
  id         String   @id @default(uuid())
  resourceId String
  resource   Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  name       String   @db.VarChar(100)
  level      String   @db.VarChar(20)
  createdAt  DateTime @default(now())
  @@unique([resourceId, name])
  @@schema("resource")
}

model CapacityPeriod {
  id           String   @id @default(uuid())
  resourceId   String
  resource     Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  periodStart  DateTime @db.Date
  capacityPct  Decimal  @db.Decimal(5, 2)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([resourceId, periodStart])
  @@schema("resource")
}

model Allocation {
  id                      String   @id @default(uuid())
  resourceId              String
  resource                Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  projectId               String   @db.VarChar(36)
  periodStart             DateTime @db.Date
  periodEnd               DateTime @db.Date
  allocationPct           Decimal  @db.Decimal(5, 2)
  overAllocatedConfirmed  Boolean  @default(false)
  createdBy               String   @db.VarChar(36)
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  @@index([resourceId, periodStart, periodEnd])
  @@schema("resource")
}
```
