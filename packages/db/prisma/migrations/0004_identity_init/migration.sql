-- identity-access unit — tables in the `identity` schema (schema created in 0001_init).

CREATE TABLE "identity"."user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_subject_key" ON "identity"."user"("subject");

CREATE TABLE "identity"."role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "role_key_key" ON "identity"."role"("key");

CREATE TABLE "identity"."permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permission_key_key" ON "identity"."permission"("key");

CREATE TABLE "identity"."role_permission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "identity"."user_role" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role_id")
);

CREATE TABLE "identity"."user_scope" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" UUID,
    "subtree_root_id" UUID,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_scope_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_scope_user_id_idx" ON "identity"."user_scope"("user_id");

ALTER TABLE "identity"."role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity"."role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "identity"."permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity"."user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity"."user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity"."user_scope" ADD CONSTRAINT "user_scope_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
