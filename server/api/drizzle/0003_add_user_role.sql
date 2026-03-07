-- Add role column to user table for admin access control (admin.zedi-note.app, /api/admin/*)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;
UPDATE "user"
SET "role" = 'user'
WHERE "role" IS NULL OR "role" NOT IN ('user', 'admin');
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_role_check";
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("role" IN ('user', 'admin'));
