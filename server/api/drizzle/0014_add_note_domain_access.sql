-- Add `note_domain_access` for domain-scoped access rules on notes.
-- ノートのドメイン招待テーブル (Phase 6 / issue #663) を追加する。
--
-- 「`@example.com` のメールでサインインした人は自動で viewer/editor」ルール。
-- `note_members` を作らず "ルール" として扱うため、`GET /notes/:id/members`
-- には現れず、ドメイン削除で即座にアクセスを失効させる。
--
-- Rule like "anyone signed-in with `@example.com` becomes viewer/editor".
-- These rules deliberately do NOT create `note_members` rows — deleting a
-- rule immediately revokes access without needing any cache invalidation.
--
-- See epic otomatty/zedi#657, sub-issue #663.

CREATE TABLE "note_domain_access" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "note_id" uuid NOT NULL,
    "domain" text NOT NULL,
    "role" text DEFAULT 'viewer' NOT NULL,
    "created_by_user_id" text NOT NULL,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "uq_note_domain_access_note_domain" UNIQUE("note_id","domain")
);
--> statement-breakpoint
ALTER TABLE "note_domain_access"
    ADD CONSTRAINT "note_domain_access_note_id_notes_id_fk"
    FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "note_domain_access"
    ADD CONSTRAINT "note_domain_access_created_by_user_id_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_note_domain_access_note_id" ON "note_domain_access" ("note_id");
--> statement-breakpoint
CREATE INDEX "idx_note_domain_access_domain" ON "note_domain_access" ("domain");
