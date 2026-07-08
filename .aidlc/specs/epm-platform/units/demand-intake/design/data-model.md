# Data Model — demand-intake

## Summary

Six Prisma models live in the `intake` PostgreSQL schema (`@@schema("intake")`, multi-schema
alongside `identity` / `strategy` / `execution`): `DemandRequest`, `ScoringModel`,
`ScoringCriterion`, `ScoreCard`, `CriterionScore`, and `GateDecision`. Three native enums
(`DemandStatus`, `IntakeGate`, `GateOutcome`) also live in the `intake` schema. The `intake`
value is already present in the datasource `schemas` array; the migration is `0006_intake_init`.

Ownership within `intake` is enforced with real foreign keys: `ScoringModel 1—N ScoringCriterion`,
`DemandRequest 1—1 ScoreCard`, `ScoreCard 1—N CriterionScore`, and `DemandRequest 1—N GateDecision`.
Every reference **out of** the `intake` schema is a **soft UUID reference with NO cross-schema
foreign key**: `ScoringCriterion.goalId` → `strategy.StrategicGoal` (strategic-fit traceability
only, not validated at runtime, D3-1) and `DemandRequest.promotedProjectId` → `execution.Project`
(set best-effort after promotion, never required, D3-2). `ScoreCard.scoringModelId` and
`CriterionScore.criterionId` are captured as **soft UUID refs** (not FKs) so a request keeps the
exact model version it was scored against even if the model is superseded (D3-3). Conventions
mirror the `execution` / `strategy` schemas: `@db.Uuid` ids defaulted with `gen_random_uuid()`,
`@db.Timestamptz(6)` timestamps, `@updatedAt`, `@db.Decimal(18,2)` money, snake_case `@map` /
`@@map`, and named `@@index`.

## Schema: `intake`

All tables live in the `intake` PostgreSQL schema. Migrations are owned by
`packages/db/migrations/` (migration `0006_intake_init`). There are no physical foreign keys
crossing schema boundaries.

## Entity-Relationship Description

- **DemandRequest** (aggregate root) — a captured demand submission. `1—1 ScoreCard` (at most
  one active score card) and `1—N GateDecision` (an audit trail of gate transitions). Carries
  `status` (lifecycle) and `currentGate` (position in the fixed linear sequence).
- **ScoringModel** (aggregate root) — a versioned weighted scoring model; exactly one is
  `isActive` at a time. `1—N ScoringCriterion`.
- **ScoringCriterion** — a weighted criterion within a model. Real FK `scoringModelId`; optional
  soft `goalId` for strategic-fit traceability (no FK, D3-1).
- **ScoreCard** — the single active score card per demand request (real FK `demandRequestId`,
  unique). Holds the computed `weightedTotal` (0–100). `scoringModelId` is a soft ref to the
  scored model version. `1—N CriterionScore`.
- **CriterionScore** — one raw score per criterion within a score card (real FK `scoreCardId`;
  soft `criterionId` ref to `ScoringCriterion`), unique per `(scoreCardId, criterionId)`.
- **GateDecision** — an append-style record of each advance/reject decision on a request (real
  FK `demandRequestId`).

```
DemandRequest ─1──1─ ScoreCard ─1──N─ CriterionScore ─(soft)──▷ ScoringCriterion.criterionId
      │                    │
      │                    └─(soft)──▷ ScoringModel (scoringModelId — version scored against)
      │
      ├─1──N─ GateDecision
      │
      └─(soft)──▷ execution.Project  (promotedProjectId — best-effort, NO FK)

ScoringModel ─1──N─ ScoringCriterion ─(soft)──▷ strategy.StrategicGoal (goalId — traceability, NO FK)
```

---

## Tables

### `intake.demand_request`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Aggregate root |
| `title` | `varchar(200)` | NOT NULL | Required (US-029) |
| `sponsor` | `varchar(200)` | NOT NULL | Required (US-029) |
| `description` | `text` | NOT NULL | Required (US-029) |
| `expected_value` | `numeric(18,2)` | NULLABLE | Expected business value |
| `status` | `DemandStatus` | NOT NULL, default `Submitted` | Lifecycle (D3-5) |
| `current_gate` | `IntakeGate` | NOT NULL, default `Submitted` | Position in fixed linear sequence (D3-4) |
| `rejection_reason` | `text` | NULLABLE | Set on reject (terminal) |
| `submitted_by` | `uuid` | NOT NULL | Actor userId; record-scoping key |
| `submitted_at` | `timestamptz` | NOT NULL, default `now()` | Tie-break key for ranking (P2) |
| `promoted_project_id` | `uuid` | NULLABLE | Soft ref to `execution.project` — NO FK; best-effort (D3-2) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | Updated on every mutation |

**Indexes**: `idx_demand_request_status` ON `(status)`.

---

### `intake.scoring_model`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Aggregate root |
| `name` | `varchar(200)` | NOT NULL | Required (US-030) |
| `version` | `int` | NOT NULL | Monotonic version; new config creates a new version |
| `is_active` | `boolean` | NOT NULL, default `false` | Exactly one active at a time (D3-3) |
| `created_by` | `uuid` | NOT NULL | Actor (Director) userId |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | |

**Indexes**: `idx_scoring_model_active` ON `(is_active)`.

---

### `intake.scoring_criterion`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `scoring_model_id` | `uuid` | NOT NULL, FK → `intake.scoring_model(id)` | Cascade delete |
| `name` | `varchar(200)` | NOT NULL | Required (US-030) |
| `weight` | `numeric(18,2)` | NOT NULL | Relative weight (> 0) |
| `max_score` | `int` | NOT NULL, default `100` | Upper bound for a raw score |
| `goal_id` | `uuid` | NULLABLE | Soft ref to `strategy.strategic_goal` — NO FK; strategic-fit traceability (D3-1) |
| `sort_order` | `int` | NOT NULL, default `0` | Display order |

**Indexes**: `idx_scoring_criterion_model` ON `(scoring_model_id)`.

---

### `intake.score_card`

One active score card per demand request (D3-3). `scoring_model_id` is a **soft ref** to the
model version scored against (no FK) so the card is stable across model re-versioning.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `demand_request_id` | `uuid` | NOT NULL, FK → `intake.demand_request(id)` | Cascade delete |
| `scoring_model_id` | `uuid` | NOT NULL | Soft ref to `intake.scoring_model` version used — NO FK |
| `weighted_total` | `numeric(18,2)` | NOT NULL | Computed 0–100 (P1) |
| `scored_by` | `uuid` | NOT NULL | Actor userId |
| `scored_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | Updated on re-score |

**Unique**: `uq_score_card_demand` UNIQUE `(demand_request_id)` — one card per request (D3-3).

---

### `intake.criterion_score`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `score_card_id` | `uuid` | NOT NULL, FK → `intake.score_card(id)` | Cascade delete |
| `criterion_id` | `uuid` | NOT NULL | Soft ref to `intake.scoring_criterion` — NO FK |
| `raw_score` | `int` | NOT NULL | Within `[0, maxScore]` of the criterion |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Unique**: `uq_criterion_score_card_criterion` UNIQUE `(score_card_id, criterion_id)` — one raw
score per criterion per card.

---

### `intake.gate_decision`

Append-style audit of each stage-gate transition (D3-4). `to_gate` is null on reject.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `demand_request_id` | `uuid` | NOT NULL, FK → `intake.demand_request(id)` | Cascade delete |
| `from_gate` | `IntakeGate` | NOT NULL | Gate at decision time |
| `to_gate` | `IntakeGate` | NULLABLE | Target gate; null on reject |
| `decision` | `GateOutcome` | NOT NULL | Enum: Advanced / Rejected |
| `reason` | `text` | NULLABLE | Required on reject |
| `decided_by` | `uuid` | NOT NULL | Actor userId |
| `decided_at` | `timestamptz` | NOT NULL, default `now()` | |

**Indexes**: `idx_gate_decision_demand` ON `(demand_request_id)`.

---

## Prisma Schema Block (add to `packages/db/prisma/schema.prisma`)

```prisma
// ---------------------------------------------------------------------------
// demand-intake unit (`intake` schema).
// ---------------------------------------------------------------------------

enum DemandStatus {
  Submitted
  Screening
  Evaluation
  Approved
  Promoted
  Rejected

  @@schema("intake")
}

enum IntakeGate {
  Submitted
  Screening
  Evaluation
  Approved

  @@schema("intake")
}

enum GateOutcome {
  Advanced
  Rejected

  @@schema("intake")
}

model DemandRequest {
  id                String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title             String       @db.VarChar(200)
  sponsor           String       @db.VarChar(200)
  description       String
  expectedValue     Decimal?     @map("expected_value") @db.Decimal(18, 2)
  status            DemandStatus @default(Submitted)
  currentGate       IntakeGate   @default(Submitted) @map("current_gate")
  rejectionReason   String?      @map("rejection_reason")
  submittedBy       String       @map("submitted_by") @db.Uuid
  submittedAt       DateTime     @default(now()) @map("submitted_at") @db.Timestamptz(6)
  promotedProjectId String?      @map("promoted_project_id") @db.Uuid  // soft ref → execution.project — NO FK
  createdAt         DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)

  scoreCard      ScoreCard?
  gateDecisions  GateDecision[]

  @@index([status], name: "idx_demand_request_status")
  @@map("demand_request")
  @@schema("intake")
}

model ScoringModel {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String   @db.VarChar(200)
  version   Int
  isActive  Boolean  @default(false) @map("is_active")
  createdBy String   @map("created_by") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  criteria ScoringCriterion[]

  @@index([isActive], name: "idx_scoring_model_active")
  @@map("scoring_model")
  @@schema("intake")
}

model ScoringCriterion {
  id             String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scoringModelId String  @map("scoring_model_id") @db.Uuid
  name           String  @db.VarChar(200)
  weight         Decimal @db.Decimal(18, 2)
  maxScore       Int     @default(100) @map("max_score")
  goalId         String? @map("goal_id") @db.Uuid  // soft ref → strategy.strategic_goal — NO FK (D3-1)
  sortOrder      Int     @default(0) @map("sort_order")

  scoringModel ScoringModel @relation(fields: [scoringModelId], references: [id], onDelete: Cascade)

  @@index([scoringModelId], name: "idx_scoring_criterion_model")
  @@map("scoring_criterion")
  @@schema("intake")
}

/// One active score card per demand request. scoringModelId is a soft ref to the model version scored (NO FK).
model ScoreCard {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  demandRequestId String   @map("demand_request_id") @db.Uuid
  scoringModelId  String   @map("scoring_model_id") @db.Uuid  // soft ref → intake.scoring_model version — NO FK
  weightedTotal   Decimal  @map("weighted_total") @db.Decimal(18, 2)
  scoredBy        String   @map("scored_by") @db.Uuid
  scoredAt        DateTime @default(now()) @map("scored_at") @db.Timestamptz(6)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  demandRequest DemandRequest    @relation(fields: [demandRequestId], references: [id], onDelete: Cascade)
  scores        CriterionScore[]

  @@unique([demandRequestId], name: "uq_score_card_demand")
  @@map("score_card")
  @@schema("intake")
}

model CriterionScore {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scoreCardId String   @map("score_card_id") @db.Uuid
  criterionId String   @map("criterion_id") @db.Uuid  // soft ref → intake.scoring_criterion — NO FK
  rawScore    Int      @map("raw_score")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  scoreCard ScoreCard @relation(fields: [scoreCardId], references: [id], onDelete: Cascade)

  @@unique([scoreCardId, criterionId], name: "uq_criterion_score_card_criterion")
  @@map("criterion_score")
  @@schema("intake")
}

/// Append-style audit of stage-gate transitions. toGate is null on reject.
model GateDecision {
  id              String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  demandRequestId String      @map("demand_request_id") @db.Uuid
  fromGate        IntakeGate  @map("from_gate")
  toGate          IntakeGate? @map("to_gate")
  decision        GateOutcome
  reason          String?
  decidedBy       String      @map("decided_by") @db.Uuid
  decidedAt       DateTime    @default(now()) @map("decided_at") @db.Timestamptz(6)

  demandRequest DemandRequest @relation(fields: [demandRequestId], references: [id], onDelete: Cascade)

  @@index([demandRequestId], name: "idx_gate_decision_demand")
  @@map("gate_decision")
  @@schema("intake")
}
```

## Cross-Schema References

All references leaving the `intake` schema are **logical / soft UUID refs only** — there are
**no physical foreign keys across schemas** (D3-1/D3-2). Specifically:

- `ScoringCriterion.goalId` → `strategy.StrategicGoal` — strategic-fit traceability only. It is
  **not validated at runtime** and triggers **no call into `strategy-portfolio`** (D3-1). The
  unit is decoupled.
- `DemandRequest.promotedProjectId` → `execution.Project` — set **best-effort** after a
  successful promotion; never required and never a constraint (D3-2). The authoritative
  traceability link is `execution.Project.sourceDemandId = demandId`, owned by `project-execution`.

Promotion is **event-driven**: `PromotionService.promoteToProject` publishes
`demand-intake.demand.promoted` with the exact `DemandPromotedPayload` contract; `project-execution`
subscribes and creates the Project idempotently keyed by `sourceDemandId` (= `demandId`), so the
publish is safe to retry (resiliency-baseline). `ScoreCard.scoringModelId` and
`CriterionScore.criterionId` are intra-schema soft refs (no FK) that freeze the scored model
version against later re-configuration (D3-3).
