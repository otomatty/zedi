-- 005: ユーザーオンボーディング状況テーブルとページ種別カラムの追加
-- Add user onboarding status table and page kind column
--
-- 1. pages.kind を追加（'user' / 'welcome' / 'update_notice'）。既存ページは全て 'user'。
--    ウェルカムページはオーナーごとに最大 1 件となる部分ユニークインデックスを張る。
-- 2. 新テーブル user_onboarding_status を作成し、セットアップ完了時刻・ウェルカム
--    ページ生成状況・ホームスライド表示状況・更新情報自動生成トグルを保持する。
--
-- 1. Add pages.kind column ('user' / 'welcome' / 'update_notice'). Existing rows
--    default to 'user'. A partial unique index guarantees at most one live
--    welcome page per owner.
-- 2. Create user_onboarding_status table tracking setup completion, welcome
--    page creation, home slide display, and the auto-update-notice toggle.

-- ---- pages.kind ----------------------------------------------------------

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'user'
    CHECK (kind IN ('user', 'welcome', 'update_notice'));

CREATE INDEX IF NOT EXISTS idx_pages_owner_kind ON pages (owner_id, kind);

-- オーナーごとに有効なウェルカムページは最大 1 件
-- At most one live welcome page per owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_unique_welcome_per_owner
  ON pages (owner_id)
  WHERE kind = 'welcome' AND is_deleted = false;

-- ---- user_onboarding_status ---------------------------------------------

CREATE TABLE IF NOT EXISTS user_onboarding_status (
  user_id TEXT PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  setup_completed_at TIMESTAMPTZ,
  welcome_page_created_at TIMESTAMPTZ,
  welcome_page_id UUID REFERENCES pages (id) ON DELETE SET NULL,
  -- セットアップウィザードで選択したロケール。ログイン時リトライがユーザーの
  -- 意図した言語でウェルカムページを生成するために保持する。
  -- Locale chosen at the setup wizard. Retained so login-time retries create
  -- the welcome page in the user's originally selected language.
  requested_locale TEXT
    CHECK (requested_locale IS NULL OR requested_locale IN ('ja', 'en')),
  home_slides_shown_at TIMESTAMPTZ,
  auto_create_update_notice BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- バックグラウンドリトライ対象（セットアップ済みだがウェルカムページ未生成）の
-- 高速検索のための部分インデックス。
-- Partial index for retry lookups (setup completed but welcome page not yet created).
CREATE INDEX IF NOT EXISTS idx_user_onboarding_status_needs_welcome
  ON user_onboarding_status (setup_completed_at)
  WHERE setup_completed_at IS NOT NULL AND welcome_page_created_at IS NULL;

-- ---- バックフィル / Backfill -----------------------------------------------
-- このマイグレーションが走った時点で既に存在するユーザーは、旧フローで
-- セットアップを完了しているとみなして `setup_completed_at = NOW()` を記録する。
-- そうしないと次回ログイン時に全員がオンボーディングウィザードへ戻されてしまう。
-- `welcome_page_created_at` は NULL のままにしておき、バックグラウンドリトライ
-- でウェルカムページを生成する余地を残す（ユーザーが望めば）。
--
-- Backfill: mark all existing users as "setup completed" so they are not
-- forced back through the wizard on their next visit after this migration
-- lands. `welcome_page_created_at` stays NULL so the background retry is
-- free to generate a welcome page later (users can dismiss it anytime).
INSERT INTO user_onboarding_status (user_id, setup_completed_at, created_at, updated_at)
SELECT id, NOW(), NOW(), NOW()
FROM "user"
ON CONFLICT (user_id) DO NOTHING;
