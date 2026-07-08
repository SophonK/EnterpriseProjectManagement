-- project-execution unit: initial schema
-- Creates execution.project, milestone, status_update, rollup_snapshot tables.

-- CreateTable
CREATE TABLE "execution"."project" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "owner_user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "program_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "health" TEXT NOT NULL DEFAULT 'OnTrack',
    "planned_start" DATE NOT NULL,
    "planned_end" DATE NOT NULL,
    "planned_budget" DECIMAL(18,2),
    "source_demand_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_project_dates" CHECK ("planned_end" >= "planned_start"),
    CONSTRAINT "chk_project_status" CHECK ("status" IN ('Open','Active','Completed','Cancelled')),
    CONSTRAINT "chk_project_health" CHECK ("health" IN ('OnTrack','AtRisk','OffTrack'))
);

-- CreateTable
CREATE TABLE "execution"."milestone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "due_date" DATE NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable: append-only status history
CREATE TABLE "execution"."status_update" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "health" TEXT NOT NULL,
    "note" TEXT,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_update_pkey" PRIMARY KEY ("id")
);

-- CreateTable: materialized roll-up snapshot (upserted on StatusChanged)
CREATE TABLE "execution"."rollup_snapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_id" UUID NOT NULL,
    "program_id" UUID,
    "on_track_count" INTEGER NOT NULL DEFAULT 0,
    "at_risk_count" INTEGER NOT NULL DEFAULT 0,
    "off_track_count" INTEGER NOT NULL DEFAULT 0,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rollup_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_project_portfolio" ON "execution"."project"("portfolio_id");
CREATE INDEX "idx_project_program" ON "execution"."project"("program_id");
CREATE INDEX "idx_project_owner" ON "execution"."project"("owner_user_id");
CREATE INDEX "idx_project_health" ON "execution"."project"("portfolio_id", "health");
CREATE INDEX "idx_milestone_project" ON "execution"."milestone"("project_id");
CREATE INDEX "idx_status_update_project_time" ON "execution"."status_update"("project_id", "recorded_at" DESC);
CREATE UNIQUE INDEX "uq_rollup_portfolio_program" ON "execution"."rollup_snapshot"("portfolio_id", "program_id");

-- AddForeignKey
ALTER TABLE "execution"."milestone"
    ADD CONSTRAINT "milestone_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "execution"."project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "execution"."status_update"
    ADD CONSTRAINT "status_update_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "execution"."project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
