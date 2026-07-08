# Data Model — strategy-portfolio

## Summary

Six Prisma models live in the `strategy` PostgreSQL schema (`@@schema("strategy")`, multi-schema
alongside `identity` / `execution`): `StrategicGoal`, `Portfolio`, `Program`, `PortfolioGoal`,
`GoalLink`, and the `ProjectAlignmentView` read-model projection. Three native enums
(`GoalStatus`, `PortfolioStatus`, `ProgramStatus`, each `Active | Archived`, default `Active`)
are also in the `strategy` schema.

Ownership within `strategy` is enforced with real foreign keys: `Portfolio 1—N Program`,
`Portfolio N—M StrategicGoal` (via `PortfolioGoal`), and `StrategicGoal 1—N GoalLink`.
Every reference **out of** the `strategy` schema — `GoalLink.projectId`,
`ProjectAlignmentView.projectId` / `portfolioId` / `programId` back to `execution` — is a
**soft UUID reference with NO cross-schema foreign key** (D3-1/D3-2). Referential integrity for
soft refs is a matter of application logic and the event projection, never a DB constraint.
Conventions mirror the `execution` schema: `@db.Uuid` ids defaulted with
`gen_random_uuid()`, `@db.Timestamptz(6)` timestamps, `@updatedAt`, snake_case `@map` /
`@@map`, and named `@@index`.

## Schema: `strategy`

All tables live in the `strategy` PostgreSQL schema. Migrations are owned by
`packages/db/migrations/`. There are no physical foreign keys crossing schema boundaries.

## Entity-Relationship Description

- **StrategicGoal** (aggregate root) — an OKR-style strategic goal. `1—N GoalLink`
  (a goal can be linked to many projects) and participates `N—M` with `Portfolio`.
- **Portfolio** (aggregate root) — an investment portfolio owned by a Portfolio Manager.
  `1—N Program` (a portfolio contains many programs) and `N—M StrategicGoal`.
- **Program** — a program nested inside exactly one `Portfolio` (`portfolioId` required FK).
- **PortfolioGoal** — the M:N join between `Portfolio` and `StrategicGoal`; unique per
  `(portfolioId, goalId)` pair so re-association is idempotent.
- **GoalLink** — the link between a `StrategicGoal` (real FK `goalId`) and an execution
  Project (soft `projectId`, no FK); unique per `(goalId, projectId)`.
- **ProjectAlignmentView** — the local read-model, keyed by soft `projectId` (PK). Projected
  from `project-execution` events; carries the mirrored project `status`, `plannedBudget`,
  soft `portfolioId` / `programId`, and the derived `aligned` flag. Not connected by any FK —
  it is a denormalized projection.

```
StrategicGoal ─1──N─ GoalLink ─(soft)──▷ execution.Project
      │
      └─N──M─ Portfolio ──(via PortfolioGoal)
                 │
                 └─1──N─ Program

ProjectAlignmentView  (projection; PK = projectId soft-ref; soft portfolioId/programId)
```

---

## Tables

### `strategy.strategic_goal`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Aggregate root |
| `title` | `varchar(200)` | NOT NULL | Required (US-006) |
| `description` | `text` | NOT NULL | Required (US-006) |
| `measure` | `text` | NOT NULL | The target / measure (OKR) — required (US-006) |
| `status` | `GoalStatus` | NOT NULL, default `Active` | Enum: Active / Archived |
| `created_by` | `uuid` | NOT NULL | Actor (Director) userId |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | Updated on every mutation |

**Indexes**: `idx_strategic_goal_status` ON `(status)`.

---

### `strategy.portfolio`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Aggregate root |
| `name` | `varchar(200)` | NOT NULL | Required (US-007) |
| `description` | `text` | NULLABLE | |
| `owner_id` | `uuid` | NOT NULL | Creator = owner; record-scoping key |
| `status` | `PortfolioStatus` | NOT NULL, default `Active` | Enum: Active / Archived |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | |

**Indexes**: `idx_portfolio_owner` ON `(owner_id)`.

---

### `strategy.program`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `portfolio_id` | `uuid` | NOT NULL, FK → `strategy.portfolio(id)` | Required parent (D3-6) |
| `name` | `varchar(200)` | NOT NULL | Required (US-011) |
| `description` | `text` | NULLABLE | |
| `status` | `ProgramStatus` | NOT NULL, default `Active` | Enum: Active / Archived |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | |

**Indexes**: `idx_program_portfolio` ON `(portfolio_id)`.

---

### `strategy.portfolio_goal`

M:N join between `Portfolio` and `StrategicGoal` (D3-3).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `portfolio_id` | `uuid` | NOT NULL, FK → `strategy.portfolio(id)` | Cascade delete |
| `goal_id` | `uuid` | NOT NULL, FK → `strategy.strategic_goal(id)` | Cascade delete |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Unique**: `uq_portfolio_goal` UNIQUE `(portfolio_id, goal_id)` — idempotent association (P3).

---

### `strategy.goal_link`

Project ↔ Goal link (D3-2). `goal_id` is a real FK; `project_id` is a **soft ref** to
`execution.Project` with **no cross-schema FK**.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `goal_id` | `uuid` | NOT NULL, FK → `strategy.strategic_goal(id)` | Cascade delete |
| `project_id` | `uuid` | NOT NULL | Soft ref to `execution.project` — NO FK |
| `linked_by` | `uuid` | NOT NULL | Actor userId |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Unique**: `uq_goal_link` UNIQUE `(goal_id, project_id)` — idempotent link (P3).
**Indexes**: `idx_goal_link_project` ON `(project_id)` — supports alignment lookups by project.

---

### `strategy.project_alignment_view`

Read-model projection (D3-1). Keyed by the soft `project_id`; fed by the
`ProjectAlignmentProjector` from `project-execution` events. No foreign keys — all id columns
are soft refs.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `project_id` | `uuid` | PK | Soft ref to `execution.project` — NO FK |
| `name` | `varchar(200)` | NOT NULL | Mirrored from source event |
| `status` | `varchar(20)` | NOT NULL | Mirrors execution status: Open / Active / Completed / Cancelled |
| `planned_budget` | `numeric(18,2)` | NULLABLE | Mirrored; drives investment-mix sums |
| `portfolio_id` | `uuid` | NULLABLE | Soft ref — NO FK |
| `program_id` | `uuid` | NULLABLE | Soft ref — NO FK |
| `aligned` | `boolean` | NOT NULL, default `false` | Derived: `true` iff ≥1 GoalLink (D3-4) |
| `last_event_at` | `timestamptz` | NOT NULL | Out-of-order guard for upserts |
| `updated_at` | `timestamptz` | NOT NULL | |

**Indexes**:
- `idx_project_alignment_status` ON `(status)` — unaligned-report scan (US-010).
- `idx_project_alignment_portfolio` ON `(portfolio_id)` — investment-mix grouping (US-009).

---

## Prisma Schema Block (add to `packages/db/prisma/schema.prisma`)

```prisma
// ---------------------------------------------------------------------------
// strategy-portfolio unit (`strategy` schema).
// ---------------------------------------------------------------------------

enum GoalStatus {
  Active
  Archived

  @@schema("strategy")
}

enum PortfolioStatus {
  Active
  Archived

  @@schema("strategy")
}

enum ProgramStatus {
  Active
  Archived

  @@schema("strategy")
}

model StrategicGoal {
  id          String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title       String     @db.VarChar(200)
  description String
  measure     String
  status      GoalStatus @default(Active)
  createdBy   String     @map("created_by") @db.Uuid
  createdAt   DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)

  portfolioGoals PortfolioGoal[]
  goalLinks      GoalLink[]

  @@index([status], name: "idx_strategic_goal_status")
  @@map("strategic_goal")
  @@schema("strategy")
}

model Portfolio {
  id          String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String          @db.VarChar(200)
  description String?
  ownerId     String          @map("owner_id") @db.Uuid
  status      PortfolioStatus @default(Active)
  createdAt   DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime        @updatedAt @map("updated_at") @db.Timestamptz(6)

  programs       Program[]
  portfolioGoals PortfolioGoal[]

  @@index([ownerId], name: "idx_portfolio_owner")
  @@map("portfolio")
  @@schema("strategy")
}

model Program {
  id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  portfolioId String        @map("portfolio_id") @db.Uuid
  name        String        @db.VarChar(200)
  description String?
  status      ProgramStatus @default(Active)
  createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)

  portfolio   Portfolio     @relation(fields: [portfolioId], references: [id], onDelete: Cascade)

  @@index([portfolioId], name: "idx_program_portfolio")
  @@map("program")
  @@schema("strategy")
}

/// M:N join between Portfolio and StrategicGoal. Idempotent via unique pair.
model PortfolioGoal {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  portfolioId String   @map("portfolio_id") @db.Uuid
  goalId      String   @map("goal_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  portfolio   Portfolio     @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  goal        StrategicGoal @relation(fields: [goalId], references: [id], onDelete: Cascade)

  @@unique([portfolioId, goalId], name: "uq_portfolio_goal")
  @@map("portfolio_goal")
  @@schema("strategy")
}

/// Project↔Goal link. goalId is a real FK; projectId is a soft ref to execution.Project (NO cross-schema FK).
model GoalLink {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  goalId    String   @map("goal_id") @db.Uuid
  projectId String   @map("project_id") @db.Uuid  // soft ref → execution.project — NO FK
  linkedBy  String   @map("linked_by") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  goal      StrategicGoal @relation(fields: [goalId], references: [id], onDelete: Cascade)

  @@unique([goalId, projectId], name: "uq_goal_link")
  @@index([projectId], name: "idx_goal_link_project")
  @@map("goal_link")
  @@schema("strategy")
}

/// Local read-model projection of execution projects. All id columns are soft refs (NO FKs).
model ProjectAlignmentView {
  projectId     String   @id @map("project_id") @db.Uuid  // soft ref → execution.project — NO FK
  name          String   @db.VarChar(200)
  status        String   @db.VarChar(20)  // Open | Active | Completed | Cancelled
  plannedBudget Decimal? @map("planned_budget") @db.Decimal(18, 2)
  portfolioId   String?  @map("portfolio_id") @db.Uuid  // soft ref — NO FK
  programId     String?  @map("program_id") @db.Uuid    // soft ref — NO FK
  aligned       Boolean  @default(false)
  lastEventAt   DateTime @map("last_event_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([status], name: "idx_project_alignment_status")
  @@index([portfolioId], name: "idx_project_alignment_portfolio")
  @@map("project_alignment_view")
  @@schema("strategy")
}
```

## Cross-Schema References

All references leaving the `strategy` schema are **logical / soft UUID refs only** — there
are **no physical foreign keys across schemas** (D3-1/D3-2). Specifically:
`GoalLink.projectId`, `ProjectAlignmentView.projectId`, `ProjectAlignmentView.portfolioId`,
and `ProjectAlignmentView.programId` all point at `execution` rows but carry no FK constraint.

- The `ProjectAlignmentView` projection is the sole source of project data for this unit; it
  is kept current by the `ProjectAlignmentProjector` subscribing to `project-execution` events,
  never by reading execution's database or calling its API.
- The reverse soft ref — `execution.Project.programId` → `strategy.Program` — is validated by
  `project-execution` calling this module's in-process `ProgramService.programExists(programId)`
  (D3-6); it degrades gracefully if the lookup fails (resiliency-baseline).
