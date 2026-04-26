-- 0018: Add `pages.kind` column and `user_onboarding_status` table.
-- 0018: pages.kind カラムと user_onboarding_status テーブルを追加。
--
-- Background / 背景:
--   PR #728 (feat: add welcome page generation and unified media upload UI)
--   introduced `pages.kind` (`user` / `welcome` / `update_notice`) and the
--   `user_onboarding_status` table in the Drizzle TS schema, but the matching
--   `server/api/drizzle/*.sql` migration was never generated. Production and
--   development databases therefore miss both objects, which surfaces as
--   `GET /api/onboarding/status` and `POST /api/pages` returning 500
--   (`relation "user_onboarding_status" does not exist` /
--   `column "kind" of relation "pages" does not exist`).
--
--   PR #728 で `pages.kind` と `user_onboarding_status` を Drizzle TS スキーマに
--   追加したものの、対応する `server/api/drizzle/*.sql` のマイグレーション
--   ファイルが生成されていなかった。その結果、本番 / 開発 DB の両方で
--   `GET /api/onboarding/status` と `POST /api/pages` が 500 を返していた。
--
--   `db/migrations/005_add_onboarding_and_page_kind.sql` には等価な内容が
--   置かれていたが、CI (`deploy-{dev,prod}.yml`) は `bunx drizzle-kit migrate`
--   しか実行しないため、`server/api/drizzle/` に置き直す必要があった。
--
-- IF NOT EXISTS を多用しているのは、すでに手動で `db/migrations/005_*.sql` を
-- 流したことのある環境（開発者ローカル等）でも安全に再実行できるようにする
-- ため。drizzle-kit 自身は `__drizzle_migrations` テーブルで適用済みかを
-- 管理するので、本来は IF NOT EXISTS は不要だが、過去経緯への配慮として
-- 残している。
--
-- Use `IF NOT EXISTS` everywhere so that environments which previously ran the
-- legacy `db/migrations/005_*.sql` manually do not break. drizzle-kit itself
-- tracks applied migrations in `__drizzle_migrations`, so the guards are only
-- defense in depth.

-- ── pages.kind ─────────────────────────────────────────────────────────────
--
-- ADD COLUMN IF NOT EXISTS と inline CHECK を 1 文にまとめる。
-- column が新規追加されるときだけ CHECK 制約も同時に作られる。
-- legacy 環境（手動で旧 005 SQL を流したケース）ですでに column が
-- 存在する場合は ADD COLUMN ごとスキップされる。
--
-- Combine ADD COLUMN IF NOT EXISTS with an inline CHECK so the constraint is
-- created only when the column itself is created. Legacy environments that
-- already ran the old `db/migrations/005_*.sql` keep their existing column
-- and constraint untouched.

ALTER TABLE "pages"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'user'
    CHECK ("kind" IN ('user', 'welcome', 'update_notice'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_pages_owner_kind"
  ON "pages" USING btree ("owner_id", "kind");
--> statement-breakpoint

-- オーナーごとに有効なウェルカムページは最大 1 件。
-- welcomePageService.ts の `onConflictDoNothing` が target としてこの述語に
-- 依拠しているため、ここで部分ユニーク index を必ず張る。
-- At most one live welcome page per owner. The
-- `onConflictDoNothing` in welcomePageService.ts targets this exact partial
-- unique index, so it must exist for the upsert to be a no-op on conflict.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pages_unique_welcome_per_owner"
  ON "pages" ("owner_id")
  WHERE "kind" = 'welcome' AND "is_deleted" = false;
--> statement-breakpoint

-- ── user_onboarding_status ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_onboarding_status" (
  "user_id" text PRIMARY KEY NOT NULL
    REFERENCES "user" ("id") ON DELETE CASCADE,
  "setup_completed_at" timestamp with time zone,
  "welcome_page_created_at" timestamp with time zone,
  "welcome_page_id" uuid
    REFERENCES "pages" ("id") ON DELETE SET NULL,
  -- セットアップウィザードで選択したロケール。ログイン時リトライ
  -- (`retryWelcomePageIfNeeded`) がユーザーの意図した言語でウェルカム
  -- ページを生成するために保持する。NULL は「未選択」。
  -- Locale chosen at the setup wizard. Retained so login-time retries
  -- regenerate the welcome page in the user's originally selected language.
  "requested_locale" text
    CHECK ("requested_locale" IS NULL OR "requested_locale" IN ('ja', 'en')),
  "home_slides_shown_at" timestamp with time zone,
  "auto_create_update_notice" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- バックグラウンドリトライ対象（セットアップ済みだがウェルカムページ未生成）の
-- 高速検索のための部分インデックス。`retryWelcomePageIfNeeded` が WHERE 句で
-- そのまま使う形に揃えている。
-- Partial index for the login-time retry scan: rows where setup completed
-- but the welcome page has not been generated yet.
CREATE INDEX IF NOT EXISTS "idx_user_onboarding_status_needs_welcome"
  ON "user_onboarding_status" ("setup_completed_at")
  WHERE "setup_completed_at" IS NOT NULL AND "welcome_page_created_at" IS NULL;
--> statement-breakpoint

-- ── バックフィル / Backfill ────────────────────────────────────────────────
--
-- このマイグレーションが走った時点で既に存在するユーザーは、旧フローで
-- セットアップを終えていると見なし `setup_completed_at = NOW()` で記録する。
-- そうしないと次回ログインで全員が onboarding ウィザードに戻されてしまう。
-- `welcome_page_created_at` は NULL のままにしておき、`retryWelcomePageIfNeeded`
-- でログイン時にウェルカムページを生成する余地を残す。
--
-- Mark every pre-existing user as "setup completed" so they are not pushed
-- back through the wizard after this migration lands. Leaving
-- `welcome_page_created_at` as NULL keeps the login-time retry free to
-- generate a welcome page lazily.
INSERT INTO "user_onboarding_status" ("user_id", "setup_completed_at", "created_at", "updated_at")
SELECT "id", NOW(), NOW(), NOW()
FROM "user"
ON CONFLICT ("user_id") DO NOTHING;
