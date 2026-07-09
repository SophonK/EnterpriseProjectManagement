-- Migration: 0007_resource_init
-- Unit: resource-management
-- Schema: resource

CREATE SCHEMA IF NOT EXISTS "resource";

CREATE TABLE "resource"."resource_pool" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "name"       VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "resource_pool_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "resource_pool_name_key" UNIQUE ("name")
);

CREATE TABLE "resource"."resource" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"          VARCHAR(200) NOT NULL,
    "email"         VARCHAR(320) NOT NULL,
    "pool_id"       UUID         NOT NULL,
    "fte_capacity"  DECIMAL(5,2) NOT NULL,
    "over_allocated" BOOLEAN     NOT NULL DEFAULT false,
    "deleted_at"    TIMESTAMPTZ,
    "created_by"    UUID         NOT NULL,
    "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"    TIMESTAMPTZ  NOT NULL,
    CONSTRAINT "resource_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "resource_email_key"  UNIQUE ("email"),
    CONSTRAINT "resource_fte_check"  CHECK ("fte_capacity" > 0),
    CONSTRAINT "resource_pool_fkey"  FOREIGN KEY ("pool_id")
        REFERENCES "resource"."resource_pool"("id")
);

CREATE INDEX "idx_resource_pool" ON "resource"."resource" ("pool_id");

CREATE TABLE "resource"."skill" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "resource_id" UUID         NOT NULL,
    "name"        VARCHAR(100) NOT NULL,
    "level"       VARCHAR(20)  NOT NULL,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT "skill_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_skill_resource_name" UNIQUE ("resource_id", "name"),
    CONSTRAINT "skill_resource_fkey" FOREIGN KEY ("resource_id")
        REFERENCES "resource"."resource"("id") ON DELETE CASCADE
);

CREATE TABLE "resource"."capacity_period" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "resource_id"  UUID         NOT NULL,
    "period_start" DATE         NOT NULL,
    "capacity_pct" DECIMAL(5,2) NOT NULL,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"   TIMESTAMPTZ  NOT NULL,
    CONSTRAINT "capacity_period_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_capacity_period_resource_month" UNIQUE ("resource_id", "period_start"),
    CONSTRAINT "capacity_period_pct_check" CHECK ("capacity_pct" > 0 AND "capacity_pct" <= 100),
    CONSTRAINT "capacity_period_resource_fkey" FOREIGN KEY ("resource_id")
        REFERENCES "resource"."resource"("id") ON DELETE CASCADE
);

CREATE TABLE "resource"."allocation" (
    "id"                      UUID         NOT NULL DEFAULT gen_random_uuid(),
    "resource_id"             UUID         NOT NULL,
    "project_id"              VARCHAR(36)  NOT NULL,
    "period_start"            DATE         NOT NULL,
    "period_end"              DATE         NOT NULL,
    "allocation_pct"          DECIMAL(5,2) NOT NULL,
    "over_allocated_confirmed" BOOLEAN     NOT NULL DEFAULT false,
    "created_by"              UUID         NOT NULL,
    "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"              TIMESTAMPTZ  NOT NULL,
    CONSTRAINT "allocation_pkey"              PRIMARY KEY ("id"),
    CONSTRAINT "allocation_period_check"      CHECK ("period_end" >= "period_start"),
    CONSTRAINT "allocation_pct_check"         CHECK ("allocation_pct" > 0),
    CONSTRAINT "allocation_resource_fkey"     FOREIGN KEY ("resource_id")
        REFERENCES "resource"."resource"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_allocation_resource_period" ON "resource"."allocation" ("resource_id", "period_start", "period_end");
CREATE INDEX "idx_allocation_project"         ON "resource"."allocation" ("project_id");
