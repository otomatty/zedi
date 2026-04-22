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
-- このマイグレーションは冪等にしてある。
-- 一部の環境 (特に dev) では本マイグレーション追加前に `note_members.status` /
-- `note_members.accepted_user_id` カラムを手動で追加していたため、素朴な
-- `ALTER TABLE ... ADD COLUMN` だと `42701 column ... already exists` で
-- `bunx drizzle-kit migrate` が落ち、`Deploy Development` が継続的に失敗していた。
--
-- 重要な設計ポイント (PR #698 のレビュー指摘に対応):
-- バックフィル `UPDATE` の発火条件は次の対称ガードとする:
--   IF NOT (status_existed AND accepted_user_id_existed) THEN ...
-- すなわち「**このマイグレーションが少なくともどちらか片方のカラムを新規作成した
-- ときだけ** バックフィルを走らせる」。アプリの schema (`server/api/src/schema/notes.ts`)
-- と `INSERT ... ON CONFLICT DO UPDATE` (`routes/notes/crud.ts`) は両カラムを
-- 同時に参照するので、片方でも欠けていればアプリの INSERT は `42703` で失敗し、
-- その状態で生まれた `note_members` 行は存在しない。よって両方が事前から揃って
-- いた dev 系環境を除き、未削除行はすべてレガシー扱いで安全にバックフィルできる。
--
-- 反対に「両カラムとも事前に追加されていた」環境では、アプリ
-- (`POST /notes/:id/members` など) が既に `status='pending'` で本物の未受諾
-- 招待を書き込んでいる可能性があり、レガシー行と区別できないため、状態だけを
-- 見て一律 `accepted` に昇格させると本物の招待を勝手に承諾扱いにし、
-- `pageAccessService` が即座にアクセスを許可してしまう。事前カラム追加環境の
-- レガシー行整合は、運用側がカットオフ時刻を把握しているので別途 ad-hoc な
-- `UPDATE` で対応する想定。
--
-- 加えて `accepted_user_id` の更新は `COALESCE(nm."accepted_user_id", ...)`
-- で既存値を優先し、たとえ片方先行追加された環境で何らかの値が入っていても
-- 上書きしない（防御的措置）。
--
-- 4 ケース表:
--   status_existed | accepted_user_id_existed | 動作
--   ---------------+--------------------------+--------------------------------
--   false          | false                    | バックフィル実行 (prod 想定)
--   false          | true                     | バックフィル実行 (非対称・防御)
--   true           | false                    | バックフィル実行 (非対称・防御)
--   true           | true                     | スキップ (dev 想定)
--
-- This migration is idempotent.
-- The dev DB had `status` / `accepted_user_id` added manually before this
-- migration was committed, which made the original `ALTER TABLE ... ADD COLUMN`
-- crash with `42701` and broke `Deploy Development` on every push.
--
-- Important design point (addresses PR #698 review feedback):
-- The legacy backfill `UPDATE` runs when at least one of the two columns was
-- newly created by this migration:
--   IF NOT (status_existed AND accepted_user_id_existed) THEN ...
-- The application schema (`server/api/src/schema/notes.ts`) and the
-- `INSERT ... ON CONFLICT DO UPDATE` in `routes/notes/crud.ts` reference both
-- columns together, so if either one was missing the app's INSERT would have
-- failed with `42703` and no `note_members` row could have been written under
-- that state. So unless BOTH columns were present before this migration, every
-- non-deleted row is legacy and safe to backfill.
--
-- Conversely, when BOTH columns existed before, the app may already have
-- written real `status='pending'` rows for genuine unaccepted invites via
-- `POST /notes/:id/members`. Those rows are indistinguishable from legacy
-- pre-column rows by state alone, so blindly promoting them to `accepted`
-- would silently grant access through `pageAccessService` before the invitee
-- actually accepted. Operators on such environments must run a targeted
-- backfill out of band using a known cutoff timestamp instead.
--
-- The `accepted_user_id` assignment is wrapped in `COALESCE` to preserve any
-- preexisting value (defensive: handles the unlikely asymmetric case where
-- one column was hot-added with non-NULL data).
--
-- Truth table:
--   status_existed | accepted_user_id_existed | action
--   ---------------+--------------------------+----------------------------
--   false          | false                    | backfill (prod path)
--   false          | true                     | backfill (asymmetric, safe)
--   true           | false                    | backfill (asymmetric, safe)
--   true           | true                     | skip (dev path)

DO $$
DECLARE
    status_existed              boolean;
    accepted_user_id_existed    boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'note_members'
          AND column_name = 'status'
    ) INTO status_existed;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'note_members'
          AND column_name = 'accepted_user_id'
    ) INTO accepted_user_id_existed;

    IF NOT status_existed THEN
        ALTER TABLE "note_members"
            ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;
    END IF;

    IF NOT accepted_user_id_existed THEN
        ALTER TABLE "note_members"
            ADD COLUMN "accepted_user_id" text;
    END IF;

    -- Backfill when at least one of the two columns was newly added by this
    -- migration. The application's `INSERT ... ON CONFLICT DO UPDATE`
    -- references both columns together, so if either was missing the app
    -- could not have inserted any state-machine row, and every existing
    -- non-deleted row is legacy. Only when BOTH columns pre-existed (the
    -- documented dev case) might `status = 'pending'` rows include genuine
    -- unaccepted invites; in that case we skip and defer to operators.
    --
    -- `COALESCE` preserves any preexisting `accepted_user_id` value so we
    -- never overwrite real data with a (possibly-NULL) email lookup result.
    IF NOT (status_existed AND accepted_user_id_existed) THEN
        IF EXISTS (
            SELECT 1
            FROM "note_members" AS nm
            JOIN "user" AS u
              ON LOWER(u."email") = LOWER(nm."member_email")
            WHERE nm."is_deleted" = false
            GROUP BY LOWER(nm."member_email")
            HAVING COUNT(DISTINCT u."id") > 1
        ) THEN
            RAISE EXCEPTION
                '0015_add_note_members_status_accepted_user found multiple users for the same lowercase email; normalize duplicate user.email values before running this migration.';
        END IF;

        UPDATE "note_members" AS nm
        SET
            "status" = 'accepted',
            "accepted_user_id" = COALESCE(
                nm."accepted_user_id",
                (
                    SELECT u."id"
                    FROM "user" AS u
                    WHERE LOWER(u."email") = LOWER(nm."member_email")
                    LIMIT 1
                )
            )
        WHERE nm."is_deleted" = false;
    ELSE
        RAISE WARNING
            '0015_add_note_members_status_accepted_user skipped the legacy backfill because both columns already existed; run the documented manual backfill if this environment still has pre-migration note_members rows.';
    END IF;

    -- PostgreSQL has no `ADD CONSTRAINT IF NOT EXISTS`, so check `pg_constraint`
    -- scoped to the target table (`conrelid`) to avoid false positives from
    -- same-named constraints elsewhere in the catalog.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'note_members_accepted_user_id_user_id_fk'
          AND conrelid = '"note_members"'::regclass
    ) THEN
        ALTER TABLE "note_members"
            ADD CONSTRAINT "note_members_accepted_user_id_user_id_fk"
            FOREIGN KEY ("accepted_user_id")
            REFERENCES "user"("id")
            ON DELETE SET NULL
            ON UPDATE NO ACTION;
    END IF;
END$$;
