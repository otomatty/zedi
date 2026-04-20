-- Add share-link invite tables for notes (viewer-only during Phase 3).
-- ノート共有リンク（Phase 3 は viewer ロール限定）のためのテーブルを追加する。
--
-- - `note_invite_links`:    発行済みリンクの本体。`revoked_at` で soft-revoke。
-- - `note_invite_link_redemptions`: 受諾履歴。`(link_id, redeemed_by_user_id)` の
--   ユニーク制約で同一ユーザーの再クリックによる使用回数の二重計上を防ぐ。
--
-- See epic otomatty/zedi#657, sub-issue #660.

CREATE TABLE "note_invite_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "note_id" uuid NOT NULL,
    "token" text NOT NULL,
    "role" text DEFAULT 'viewer' NOT NULL,
    "created_by_user_id" text NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "max_uses" integer,
    "used_count" integer DEFAULT 0 NOT NULL,
    "revoked_at" timestamp with time zone,
    "require_sign_in" boolean DEFAULT true NOT NULL,
    "label" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "note_invite_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "note_invite_links"
    ADD CONSTRAINT "note_invite_links_note_id_notes_id_fk"
    FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "note_invite_links"
    ADD CONSTRAINT "note_invite_links_created_by_user_id_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_note_invite_links_note_id" ON "note_invite_links" ("note_id");
--> statement-breakpoint
CREATE INDEX "idx_note_invite_links_created_by" ON "note_invite_links" ("created_by_user_id");
--> statement-breakpoint
CREATE TABLE "note_invite_link_redemptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "link_id" uuid NOT NULL,
    "redeemed_by_user_id" text NOT NULL,
    "redeemed_email" text NOT NULL,
    "redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "uq_note_invite_link_redemptions_link_user" UNIQUE("link_id","redeemed_by_user_id")
);
--> statement-breakpoint
ALTER TABLE "note_invite_link_redemptions"
    ADD CONSTRAINT "note_invite_link_redemptions_link_id_note_invite_links_id_fk"
    FOREIGN KEY ("link_id") REFERENCES "note_invite_links"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "note_invite_link_redemptions"
    ADD CONSTRAINT "note_invite_link_redemptions_redeemed_by_user_id_user_id_fk"
    FOREIGN KEY ("redeemed_by_user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_note_invite_link_redemptions_link" ON "note_invite_link_redemptions" ("link_id");
