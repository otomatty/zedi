-- 003: 招待トークン管理 / Invitation token management
-- note_members に招待ステータスを追加し、note_invitations テーブルを新規作成する。
-- Add invitation status to note_members and create note_invitations table.

-- ── note_members: ステータス + 承認ユーザー ID を追加 ─────────────────────────
ALTER TABLE note_members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined'));

-- Backfill: treat all existing non-deleted members as accepted
-- 既存の有効メンバーを accepted に設定する
UPDATE note_members SET status = 'accepted' WHERE is_deleted = FALSE;

ALTER TABLE note_members
  ADD COLUMN IF NOT EXISTS accepted_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;

-- ── note_invitations テーブル ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  member_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  UNIQUE(note_id, member_email)
);

CREATE INDEX IF NOT EXISTS idx_note_invitations_token
  ON note_invitations(token);

CREATE INDEX IF NOT EXISTS idx_note_invitations_note_id
  ON note_invitations(note_id);
