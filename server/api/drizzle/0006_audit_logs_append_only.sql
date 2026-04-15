-- Add deterministic ordering index and append-only triggers for admin_audit_logs.
-- 監査ログの順序安定化用インデックスと追記専用トリガーを追加する。

CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_created_id"
  ON "admin_audit_logs" ("created_at" DESC, "id" DESC);

CREATE OR REPLACE FUNCTION "prevent_admin_audit_logs_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS "trg_admin_audit_logs_no_update" ON "admin_audit_logs";
CREATE TRIGGER "trg_admin_audit_logs_no_update"
BEFORE UPDATE ON "admin_audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "prevent_admin_audit_logs_mutation"();

DROP TRIGGER IF EXISTS "trg_admin_audit_logs_no_delete" ON "admin_audit_logs";
CREATE TRIGGER "trg_admin_audit_logs_no_delete"
BEFORE DELETE ON "admin_audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "prevent_admin_audit_logs_mutation"();
