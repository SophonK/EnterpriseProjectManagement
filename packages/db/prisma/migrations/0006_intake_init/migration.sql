-- demand-intake unit — tables in the `intake` schema (schema declared in 0001_init).
-- Creates intake.demand_request, scoring_model, scoring_criterion, score_card, criterion_score, gate_decision.

-- CreateSchema (idempotent; schema already declared in 0001_init)
CREATE SCHEMA IF NOT EXISTS "intake";

-- CreateEnum
CREATE TYPE "intake"."DemandStatus" AS ENUM ('Submitted', 'Screening', 'Evaluation', 'Approved', 'Promoted', 'Rejected');

-- CreateEnum
CREATE TYPE "intake"."IntakeGate" AS ENUM ('Submitted', 'Screening', 'Evaluation', 'Approved');

-- CreateEnum
CREATE TYPE "intake"."GateOutcome" AS ENUM ('Advanced', 'Rejected');

-- CreateTable
CREATE TABLE "intake"."demand_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "sponsor" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "expected_value" DECIMAL(18,2),
    "status" "intake"."DemandStatus" NOT NULL DEFAULT 'Submitted',
    "current_gate" "intake"."IntakeGate" NOT NULL DEFAULT 'Submitted',
    "rejection_reason" TEXT,
    "submitted_by" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promoted_project_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "demand_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."scoring_model" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scoring_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."scoring_criterion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scoring_model_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "weight" DECIMAL(18,2) NOT NULL,
    "max_score" INTEGER NOT NULL DEFAULT 100,
    "goal_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scoring_criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."score_card" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demand_request_id" UUID NOT NULL,
    "scoring_model_id" UUID NOT NULL,
    "weighted_total" DECIMAL(18,2) NOT NULL,
    "scored_by" UUID NOT NULL,
    "scored_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "score_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."criterion_score" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "score_card_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "raw_score" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "criterion_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."gate_decision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demand_request_id" UUID NOT NULL,
    "from_gate" "intake"."IntakeGate" NOT NULL,
    "to_gate" "intake"."IntakeGate",
    "decision" "intake"."GateOutcome" NOT NULL,
    "reason" TEXT,
    "decided_by" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_demand_request_status" ON "intake"."demand_request"("status");
CREATE INDEX "idx_scoring_model_active" ON "intake"."scoring_model"("is_active");
CREATE INDEX "idx_scoring_criterion_model" ON "intake"."scoring_criterion"("scoring_model_id");
CREATE UNIQUE INDEX "uq_score_card_demand" ON "intake"."score_card"("demand_request_id");
CREATE UNIQUE INDEX "uq_criterion_score_card_criterion" ON "intake"."criterion_score"("score_card_id", "criterion_id");
CREATE INDEX "idx_gate_decision_demand" ON "intake"."gate_decision"("demand_request_id");

-- AddForeignKey: intra-schema FKs only (no cross-schema FKs — soft refs to strategy/execution stay unconstrained)
ALTER TABLE "intake"."scoring_criterion"
    ADD CONSTRAINT "scoring_criterion_scoring_model_id_fkey"
    FOREIGN KEY ("scoring_model_id") REFERENCES "intake"."scoring_model"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "intake"."score_card"
    ADD CONSTRAINT "score_card_demand_request_id_fkey"
    FOREIGN KEY ("demand_request_id") REFERENCES "intake"."demand_request"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "intake"."criterion_score"
    ADD CONSTRAINT "criterion_score_score_card_id_fkey"
    FOREIGN KEY ("score_card_id") REFERENCES "intake"."score_card"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "intake"."gate_decision"
    ADD CONSTRAINT "gate_decision_demand_request_id_fkey"
    FOREIGN KEY ("demand_request_id") REFERENCES "intake"."demand_request"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
