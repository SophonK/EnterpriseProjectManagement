# Functional Design — project-execution

## Aggregates & Entities

### Project (Aggregate Root)

**Invariants**:
1. `plannedEnd >= plannedStart` — enforced at create and update
2. Status transitions follow the state machine (see below)
3. A project belongs to exactly one portfolio; program membership is optional
4. Archived projects (`archivedAt != null`) are excluded from active queries and roll-ups
5. Project name must be unique within a portfolio (case-insensitive check in service layer → `EXECUTION_004`)

**Lifecycle**:
```
Open ──────────► Active ──────────► Completed (terminal)
                    │
                    └────────────► Cancelled (terminal)
```

Invalid transitions → `EXECUTION_003` (422 Unprocessable Entity).

### Milestone (Entity, child of Project)

**Invariants**:
1. `dueDate` must be a valid date (not past at creation is NOT enforced — planning can add past milestones)
2. `overdue = (dueDate < today AND completedAt IS NULL)` — evaluated on every read and write

**Overdue detection**: computed at read time in `MilestoneRepository.findByProject()`; the `overdue` boolean column is a materialized flag updated on: milestone read, `dueDate` update, and `completedAt` being set. No scheduled job required for MVP.

### StatusUpdate (Value Object / Append-only Record)

Immutable once written. Each call to `UpdateStatusHealth` inserts a new row. The `project.status` and `project.health` columns are updated in the same transaction to keep the aggregate consistent.

### RollupSnapshot (Projection)

Not a true domain aggregate — it is a materialized read projection. Updated by `RollupService` inside a transaction triggered by `StatusChanged` domain events. Consumers (reporting-dashboards) read this snapshot for portfolio health counts.

---

## Business Rules

### BR-001: Date Range Validation
`plannedEnd >= plannedStart`. Checked at create and at patch. When patching only one date, the check is performed against the stored counterpart.

### BR-002: Status State Machine
See state machine above. Terminal statuses (`Completed`, `Cancelled`) cannot be changed.

### BR-003: Health → Portfolio At-Risk View
When `health` is `AtRisk` or `OffTrack`, the project must appear in the portfolio at-risk query (`idx_project_health` index). This is a query filter, not a separate flag.

### BR-004: Roll-Up Computation
```
RollupSnapshot.onTrackCount  = COUNT(projects) WHERE health='OnTrack'  AND status != 'Cancelled'
RollupSnapshot.atRiskCount   = COUNT(projects) WHERE health='AtRisk'   AND status != 'Cancelled'
RollupSnapshot.offTrackCount = COUNT(projects) WHERE health='OffTrack' AND status != 'Cancelled'
RollupSnapshot.totalCount    = onTrackCount + atRiskCount + offTrackCount
```

Cancelled projects are excluded from health counts (they are no longer "active work"). Completed projects ARE included (they represent done work).

Computed for both portfolio-level (all projects in portfolio) and per-program (projects with `programId`).

### BR-005: Demand-Promoted Auto-Create
When `demand-intake.demand.promoted` is received, `ProjectService.createProject()` is called with `status = 'Open'`. Idempotency: if a project with `sourceDemandId = demandId` already exists, the event is silently discarded.

### BR-006: Record Scoping
- `EPMO Director`: see all active projects
- `Portfolio Manager`: see projects in their portfolios
- `Project Manager`: see projects they own (`ownerUserId = ctx.userId`)
- Others: no access to project data directly (access via reporting read-only endpoints in Phase 2)

---

## Rollup Service Logic

```
onStatusChanged(event):
  portfolioId = event.payload.portfolioId
  programId   = event.payload.programId

  // Recompute portfolio-level
  counts = db.project.groupBy(portfolioId, health)  // WHERE archived_at IS NULL AND status != 'Cancelled'
  upsert rollup_snapshot WHERE portfolio_id = portfolioId AND program_id IS NULL

  // Recompute program-level (if applicable)
  IF programId != null:
    counts = db.project.groupBy(portfolioId, programId, health)
    upsert rollup_snapshot WHERE portfolio_id = portfolioId AND program_id = programId

  publish RollupRecomputed event
```

The upsert uses Prisma's `upsert` with the `(portfolioId, programId)` unique index.

---

## Overdue Milestone Check

Evaluated lazily on read:
```
GET /api/v1/projects/:id/milestones
  → For each milestone: overdue = (dueDate < today AND completedAt IS NULL)
  → If computed overdue != stored overdue: update column + publish MilestoneOverdue event
```

This means milestones transition to overdue the first time they are read after their due date passes. Acceptable for MVP; a scheduled job can backfill in Phase 2 if needed.
