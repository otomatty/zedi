-- 0029: Make user FKs on `note_invite_links` / `note_invite_link_redemptions`
-- explicit `ON DELETE CASCADE` to match the rest of the user FKs in
-- `server/api/src/schema/notes.ts` (see issue #680, follow-up of #672 / #678).
--
-- `created_by_user_id` と `redeemed_by_user_id` は 0013 で
-- `ON DELETE NO ACTION` のまま登録されていたが、`NOT NULL` と組み合わさると
-- ユーザー削除が FK 違反でブロックされてしまう。同ファイル内の他の
-- user FK（`note_members.invited_by_user_id` / `note_invitations.invited_by_user_id`
-- / `note_domain_access.created_by_user_id`）と同じく `CASCADE` に揃え、
-- 直接 `DELETE FROM "user"` した場合のオーファン化を防ぐ。
--
-- In practice this is a no-op: `note_invite_links.note_id` cascades from
-- `notes`, which cascades from `user`, so user deletion already wipes
-- these rows transitively. This migration just closes the edge case where
-- a user row is deleted without first deleting their notes.
--
-- Idempotent / re-run safety: DROP CONSTRAINT IF EXISTS, then re-add inside
-- a DO block that swallows `duplicate_object` so re-running is safe.

ALTER TABLE "note_invite_links"
    DROP CONSTRAINT IF EXISTS "note_invite_links_created_by_user_id_user_id_fk";
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "note_invite_links"
        ADD CONSTRAINT "note_invite_links_created_by_user_id_user_id_fk"
        FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "note_invite_link_redemptions"
    DROP CONSTRAINT IF EXISTS "note_invite_link_redemptions_redeemed_by_user_id_user_id_fk";
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "note_invite_link_redemptions"
        ADD CONSTRAINT "note_invite_link_redemptions_redeemed_by_user_id_user_id_fk"
        FOREIGN KEY ("redeemed_by_user_id") REFERENCES "user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- `redeemed_by_user_id` 単体のインデックス。
-- `(link_id, redeemed_by_user_id)` の複合ユニークは先頭列が `link_id` のため
-- `redeemed_by_user_id` 単独検索には効かず、CASCADE 削除時の seq scan を招く。
-- Standalone index on `redeemed_by_user_id` so cascade deletes from `user`
-- can use an index instead of sequential-scanning this table.
CREATE INDEX IF NOT EXISTS "idx_note_invite_link_redemptions_user"
    ON "note_invite_link_redemptions" ("redeemed_by_user_id");
