-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "execution";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "intake";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "reporting";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "resource";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "risk";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "shared";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "strategy";

-- CreateTable
CREATE TABLE "shared"."audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared"."outbox" (
    "event_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "shared"."processed_events" (
    "event_id" UUID NOT NULL,
    "handler" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id","handler")
);

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "shared"."audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "shared"."audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "outbox_processed_at_idx" ON "shared"."outbox"("processed_at");

