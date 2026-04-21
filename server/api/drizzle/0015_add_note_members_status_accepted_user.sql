-- Add `status` and `accepted_user_id` columns to `note_members`.
-- `note_members` テーブルに `status` と `accepted_user_id` カラムを追加する。
--
-- 招待フロー（メール招待 / 共有リンク受諾 / ノート作成時のオーナー自己登録）が
-- `pending` / `accepted` / `declined` の状態と、受諾したユーザー ID を保持できるよう
-- にする。これらのカラムはコード側の Drizzle スキーマ
-- (`server/api/src/schema/notes.ts`) と `routes/notes/crud.ts` の
-- `INSERT ... ON CONFLICT DO UPDATE` から既に参照されているが、対応する
-- マイグレーションが欠落していたため本番 DB では `POST /api/notes` が
-- `42703 column "status" of relation "note_members" does not exist`
-- で 500 になっていた。
--
-- 既存の `note_members` 行は、導入前はすべて「アクセス可能なメンバー」を意味して
-- いた。そのため、このマイグレーションでは未削除のレガシー行を `accepted` に
-- バックフィルしないと共有アクセスが失われる。`accepted_user_id` は履歴が無い
-- ため完全には復元できないが、既存 `user` の email と一致する場合はその `id`
-- を逆引きして保存する。
--
-- Legacy `note_members` rows predate the `pending/accepted/declined` state
-- machine and therefore already represent active access. Backfill non-deleted
-- rows to `accepted` so existing shared notes keep working after deploy.
-- `accepted_user_id` cannot be reconstructed perfectly, but when a matching
-- user already exists we restore it from `member_email`.
--
-- The membership flow (email invitations, share-link redemptions, and the
-- implicit owner self-membership created on note creation) needs to track
-- `pending` / `accepted` / `declined` plus the user that accepted the invite.
-- The Drizzle schema in `server/api/src/schema/notes.ts` and the
-- `INSERT ... ON CONFLICT DO UPDATE` in `routes/notes/crud.ts` already use
-- these columns, but no migration ever added them, so production hit
-- `42703 column "status" of relation "note_members" does not exist` on
-- every `POST /api/notes`.
--
-- このマイグレーションは冪等 (`IF NOT EXISTS` / 制約存在チェック) になっている。
-- 一部の環境 (特に dev) では本マイグレーション追加前に `note_members.status` /
-- `note_members.accepted_user_id` カラムを手動で追加していたため、素朴な
-- `ALTER TABLE ... ADD COLUMN` だと `42701 column ... already exists` で
-- `bunx drizzle-kit migrate` が落ち、`Deploy Development` が継続的に失敗していた。
-- This migration is idempotent (`IF NOT EXISTS` and constraint existence check).
-- The dev DB had `status` / `accepted_user_id` added manually before this
-- migration was committed, which made the original `ALTER TABLE ... ADD COLUMN`
-- crash with `42701` and broke `Deploy Development` on every push.

ALTER TABLE "note_members" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "note_members" ADD COLUMN IF NOT EXISTS "accepted_user_id" text;--> statement-breakpoint
UPDATE "note_members" AS nm
SET
    "status" = 'accepted',
    "accepted_user_id" = (
        SELECT u."id"
        FROM "user" AS u
        WHERE LOWER(u."email") = LOWER(nm."member_email")
        LIMIT 1
    )
WHERE nm."is_deleted" = false
  AND nm."status" = 'pending'
  AND nm."accepted_user_id" IS NULL;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'note_members_accepted_user_id_user_id_fk'
    ) THEN
        ALTER TABLE "note_members"
            ADD CONSTRAINT "note_members_accepted_user_id_user_id_fk"
            FOREIGN KEY ("accepted_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END$$;
