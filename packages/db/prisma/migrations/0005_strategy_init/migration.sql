-- strategy-portfolio unit — tables in the `strategy` schema (schema created in 0001_init).
-- Creates strategy.strategic_goal, portfolio, program, portfolio_goal, goal_link, project_alignment_view.

-- CreateSchema (idempotent; schema already declared in 0001_init)
CREATE SCHEMA IF NOT EXISTS "strategy";

-- CreateEnum
CREATE TYPE "strategy"."GoalStatus" AS ENUM ('Active', 'Archived');

-- CreateEnum
CREATE TYPE "strategy"."PortfolioStatus" AS ENUM ('Active', 'Archived');

-- CreateEnum
CREATE TYPE "strategy"."ProgramStatus" AS ENUM ('Active', 'Archived');

-- CreateTable
CREATE TABLE "strategy"."strategic_goal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "status" "strategy"."GoalStatus" NOT NULL DEFAULT 'Active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "strategic_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy"."portfolio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "owner_id" UUID NOT NULL,
    "status" "strategy"."PortfolioStatus" NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy"."program" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "strategy"."ProgramStatus" NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "program_pkey" PRIMARY KEY ("id")
);

-- CreateTable: M:N join between portfolio and strategic_goal
CREATE TABLE "strategy"."portfolio_goal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable: project<->goal link; project_id is a soft ref to execution.project (NO cross-schema FK)
CREATE TABLE "strategy"."goal_link" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "goal_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "linked_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable: read-model projection; all id columns are soft refs (NO FKs)
CREATE TABLE "strategy"."project_alignment_view" (
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "planned_budget" DECIMAL(18,2),
    "portfolio_id" UUID,
    "program_id" UUID,
    "aligned" BOOLEAN NOT NULL DEFAULT false,
    "last_event_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_alignment_view_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE INDEX "idx_strategic_goal_status" ON "strategy"."strategic_goal"("status");
CREATE INDEX "idx_portfolio_owner" ON "strategy"."portfolio"("owner_id");
CREATE INDEX "idx_program_portfolio" ON "strategy"."program"("portfolio_id");
CREATE UNIQUE INDEX "uq_portfolio_goal" ON "strategy"."portfolio_goal"("portfolio_id", "goal_id");
CREATE UNIQUE INDEX "uq_goal_link" ON "strategy"."goal_link"("goal_id", "project_id");
CREATE INDEX "idx_goal_link_project" ON "strategy"."goal_link"("project_id");
CREATE INDEX "idx_project_alignment_status" ON "strategy"."project_alignment_view"("status");
CREATE INDEX "idx_project_alignment_portfolio" ON "strategy"."project_alignment_view"("portfolio_id");

-- AddForeignKey: intra-schema FKs only (no cross-schema FKs — soft refs to execution stay unconstrained)
ALTER TABLE "strategy"."program"
    ADD CONSTRAINT "program_portfolio_id_fkey"
    FOREIGN KEY ("portfolio_id") REFERENCES "strategy"."portfolio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strategy"."portfolio_goal"
    ADD CONSTRAINT "portfolio_goal_portfolio_id_fkey"
    FOREIGN KEY ("portfolio_id") REFERENCES "strategy"."portfolio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strategy"."portfolio_goal"
    ADD CONSTRAINT "portfolio_goal_goal_id_fkey"
    FOREIGN KEY ("goal_id") REFERENCES "strategy"."strategic_goal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strategy"."goal_link"
    ADD CONSTRAINT "goal_link_goal_id_fkey"
    FOREIGN KEY ("goal_id") REFERENCES "strategy"."strategic_goal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
