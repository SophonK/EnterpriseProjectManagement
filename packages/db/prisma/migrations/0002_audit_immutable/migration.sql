-- Enforce audit-log immutability at the database level (NFR SEC-3).
-- Application code only ever inserts; UPDATE/DELETE are blocked by a trigger so the
-- guarantee does not rely on convention alone.

CREATE OR REPLACE FUNCTION "shared".prevent_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "shared"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION "shared".prevent_audit_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "shared"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION "shared".prevent_audit_mutation();
