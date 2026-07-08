# Data Model — project-execution

## Schema: `execution`

All tables live in the `execution` PostgreSQL schema. Migrations are owned by `packages/db/migrations/`.

---

## Tables

### `execution.project`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `name` | `varchar(200)` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `owner_user_id` | `uuid` | NOT NULL | References identity (logical FK, no physical cross-schema FK) |
| `portfolio_id` | `uuid` | NOT NULL | References strategy.portfolio (logical) |
| `program_id` | `uuid` | NULLABLE | References strategy.program (logical) |
| `status` | `varchar(20)` | NOT NULL, default `'Open'` | Enum: Open / Active / Completed / Cancelled |
| `health` | `varchar(20)` | NOT NULL, default `'OnTrack'` | Enum: OnTrack / AtRisk / OffTrack |
| `planned_start` | `date` | NOT NULL | |
| `planned_end` | `date` | NOT NULL | CHECK `planned_end >= planned_start` |
| `planned_budget` | `numeric(18,2)` | NULLABLE | Phase 2 extended; MVP captures but does not enforce |
| `archived_at` | `timestamptz` | NULLABLE | Soft-delete; NULL = active |
| `created_by` | `uuid` | NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | Updated on every mutation |

**Indexes**:
- `idx_project_portfolio` ON `(portfolio_id)` WHERE `archived_at IS NULL`
- `idx_project_program` ON `(program_id)` WHERE `program_id IS NOT NULL AND archived_at IS NULL`
- `idx_project_owner` ON `(owner_user_id)` WHERE `archived_at IS NULL`
- `idx_project_health` ON `(portfolio_id, health)` WHERE `archived_at IS NULL` — supports at-risk query

**Constraints**:
- `chk_project_dates`: `planned_end >= planned_start`
- `chk_project_status`: `status IN ('Open','Active','Completed','Cancelled')`
- `chk_project_health`: `health IN ('OnTrack','AtRisk','OffTrack')`

---

### `execution.milestone`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | NOT NULL, FK → `execution.project(id)` | Cascade delete |
| `title` | `varchar(300)` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `due_date` | `date` | NOT NULL | |
| `completed_at` | `timestamptz` | NULLABLE | NULL = not complete |
| `overdue` | `boolean` | NOT NULL, default `false` | Set by domain check: `due_date < today AND completed_at IS NULL` |
| `sort_order` | `integer` | NOT NULL, default `0` | Client-controlled ordering |
| `created_by` | `uuid` | NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | |

**Indexes**:
- `idx_milestone_project` ON `(project_id)`
- `idx_milestone_overdue` ON `(project_id)` WHERE `overdue = true`

---

### `execution.status_update`

Immutable append-only history of status/health changes.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | NOT NULL, FK → `execution.project(id)` | |
| `status` | `varchar(20)` | NOT NULL | Snapshot at time of update |
| `health` | `varchar(20)` | NOT NULL | Snapshot at time of update |
| `note` | `text` | NULLABLE | Optional PM comment |
| `recorded_by` | `uuid` | NOT NULL | Actor |
| `recorded_at` | `timestamptz` | NOT NULL, default `now()` | |

**Indexes**:
- `idx_status_update_project_time` ON `(project_id, recorded_at DESC)` — history queries

**Notes**: No UPDATE/DELETE on this table — audit-grade history.

---

### `execution.rollup_snapshot`

Stores the last computed roll-up for a portfolio/program. Updated by `RollupService`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK | |
| `portfolio_id` | `uuid` | NOT NULL | |
| `program_id` | `uuid` | NULLABLE | NULL = portfolio-level roll-up |
| `on_track_count` | `integer` | NOT NULL, default `0` | |
| `at_risk_count` | `integer` | NOT NULL, default `0` | |
| `off_track_count` | `integer` | NOT NULL, default `0` | |
| `total_count` | `integer` | NOT NULL, default `0` | |
| `computed_at` | `timestamptz` | NOT NULL | |

**Unique index**: `UNIQUE (portfolio_id, program_id)` (NULLS DISTINCT: one portfolio-level row per portfolio).

---

## Prisma Model Fragment

```prisma
// packages/db/prisma/schema.prisma (execution schema additions)

model Project {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String   @db.VarChar(200)
  description   String?
  ownerUserId   String   @db.Uuid
  portfolioId   String   @db.Uuid
  programId     String?  @db.Uuid
  status        String   @default("Open")
  health        String   @default("OnTrack")
  plannedStart  DateTime @db.Date
  plannedEnd    DateTime @db.Date
  plannedBudget Decimal? @db.Decimal(18, 2)
  archivedAt    DateTime?
  createdBy     String   @db.Uuid
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  milestones    Milestone[]
  statusUpdates StatusUpdate[]

  @@map("project")
  @@schema("execution")
}

model Milestone {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId   String    @db.Uuid
  title       String    @db.VarChar(300)
  description String?
  dueDate     DateTime  @db.Date
  completedAt DateTime?
  overdue     Boolean   @default(false)
  sortOrder   Int       @default(0)
  createdBy   String    @db.Uuid
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("milestone")
  @@schema("execution")
}

model StatusUpdate {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId  String   @db.Uuid
  status     String
  health     String
  note       String?
  recordedBy String   @db.Uuid
  recordedAt DateTime @default(now())

  project    Project  @relation(fields: [projectId], references: [id])

  @@map("status_update")
  @@schema("execution")
}

model RollupSnapshot {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  portfolioId    String    @db.Uuid
  programId      String?   @db.Uuid
  onTrackCount   Int       @default(0)
  atRiskCount    Int       @default(0)
  offTrackCount  Int       @default(0)
  totalCount     Int       @default(0)
  computedAt     DateTime

  @@unique([portfolioId, programId])
  @@map("rollup_snapshot")
  @@schema("execution")
}
```

## Cross-Schema References

All cross-unit references (e.g., `portfolio_id`, `owner_user_id`) are **logical only** — no physical foreign keys across schemas. Referential integrity is enforced at the application layer in `ProjectService.createProject()` by calling `IStrategyPortfolioService.assertPortfolioExists()` before persisting.
