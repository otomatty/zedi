-- 004: 招待メールのロケール対応と送信トラッキング
-- Invitation email locale support and send tracking
--
-- note_invitations に以下のカラムを追加:
--   - locale: 招待メールの言語（'ja' デフォルト）
--   - last_email_sent_at: 直近の送信日時
--   - email_send_count: 送信回数（再送のたびに +1）
-- Add columns for email locale, last-sent timestamp, and send counter.

ALTER TABLE note_invitations
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'ja'
    CHECK (locale IN ('ja', 'en'));

ALTER TABLE note_invitations
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;

ALTER TABLE note_invitations
  ADD COLUMN IF NOT EXISTS email_send_count INTEGER NOT NULL DEFAULT 0;
