-- Add role column to user table for admin access control (admin.zedi-note.app, /api/admin/*)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;
