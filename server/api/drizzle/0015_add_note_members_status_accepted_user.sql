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

ALTER TABLE "note_members" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "note_members" ADD COLUMN "accepted_user_id" text;--> statement-breakpoint
UPDATE "note_members" AS nm
SET
    "status" = 'accepted',
    "accepted_user_id" = (
        SELECT u."id"
        FROM "user" AS u
        WHERE LOWER(u."email") = LOWER(nm."member_email")
        LIMIT 1
    )
WHERE nm."is_deleted" = false;--> statement-breakpoint
ALTER TABLE "note_members"
    ADD CONSTRAINT "note_members_accepted_user_id_user_id_fk"
    FOREIGN KEY ("accepted_user_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action;
