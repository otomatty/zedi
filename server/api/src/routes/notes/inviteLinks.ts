/**
 * ノート共有リンク管理ルート（オーナー/編集者向け）
 *
 * POST   /:noteId/invite-links          — リンク発行（owner のみ）
 * GET    /:noteId/invite-links          — リンク一覧（owner / editor）
 * DELETE /:noteId/invite-links/:linkId  — リンク取り消し（owner のみ）
 *
 * Note invite-link management routes (owner / editor scope).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, isNull } from "drizzle-orm";
import { noteInviteLinks } from "../../schema/index.js";
import { authRequired } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import { getNoteRole, requireNoteOwner } from "./helpers.js";
import {
  generateInviteLinkToken,
  normalizeCreateInviteLinkInput,
} from "../../services/inviteLinkService.js";

const app = new Hono<AppEnv>();

// ── POST /:noteId/invite-links ─────────────────────────────────────────────

/**
 * リクエストボディのスキーマ（JSON）。
 * - role:         'viewer' のみ許容（Phase 3）
 * - expiresInMs:  有効期限までのミリ秒（省略時 7 日、最大 90 日）
 * - maxUses:      利用上限 1..100（null = 無制限）
 * - label:        棚卸し用ラベル（任意）
 * - requireSignIn: サインイン必須フラグ（省略時 true）
 */
interface CreateInviteLinkBody {
  role?: string | null;
  expiresInMs?: number | null;
  maxUses?: number | null;
  label?: string | null;
  requireSignIn?: boolean | null;
}

app.post("/:noteId/invite-links", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  await requireNoteOwner(db, noteId, userId, "Only the owner can create invite links");

  const body = await c.req.json<CreateInviteLinkBody>().catch(() => ({}) as CreateInviteLinkBody);
  let normalized;
  try {
    normalized = normalizeCreateInviteLinkInput(body);
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : "Invalid invite link input",
    });
  }

  const token = generateInviteLinkToken();
  const [created] = await db
    .insert(noteInviteLinks)
    .values({
      noteId,
      token,
      role: normalized.role,
      createdByUserId: userId,
      expiresAt: normalized.expiresAt,
      maxUses: normalized.maxUses,
      label: normalized.label,
      requireSignIn: normalized.requireSignIn,
    })
    .returning();

  if (!created) {
    throw new HTTPException(500, { message: "Failed to create invite link" });
  }

  return c.json(serializeInviteLink(created), 201);
});

// ── GET /:noteId/invite-links ──────────────────────────────────────────────

app.get("/:noteId/invite-links", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role } = await getNoteRole(noteId, userId, userEmail, db);
  if (role !== "owner" && role !== "editor") {
    throw new HTTPException(403, {
      message: "Only owner or editor can list invite links",
    });
  }

  // revokedAt がセットされたリンクは既定で除外し、監査ログ用途では別 API を想定。
  // Revoked links are hidden by default; a separate audit endpoint can surface them later.
  const rows = await db
    .select()
    .from(noteInviteLinks)
    .where(and(eq(noteInviteLinks.noteId, noteId), isNull(noteInviteLinks.revokedAt)))
    .orderBy(desc(noteInviteLinks.createdAt));

  return c.json(rows.map(serializeInviteLink));
});

// ── DELETE /:noteId/invite-links/:linkId ───────────────────────────────────

app.delete("/:noteId/invite-links/:linkId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const linkId = c.req.param("linkId");
  const userId = c.get("userId");
  const db = c.get("db");

  await requireNoteOwner(db, noteId, userId, "Only the owner can revoke invite links");

  const now = new Date();
  const [updated] = await db
    .update(noteInviteLinks)
    .set({ revokedAt: now })
    .where(
      and(
        eq(noteInviteLinks.id, linkId),
        eq(noteInviteLinks.noteId, noteId),
        isNull(noteInviteLinks.revokedAt),
      ),
    )
    .returning();

  if (!updated) {
    // 対象リンクが無い / 別ノートの ID / 既に取り消し済みのいずれか。
    // Either the link does not exist, belongs to another note, or is already revoked.
    throw new HTTPException(404, { message: "Invite link not found" });
  }

  return c.json({ revoked: true, revokedAt: updated.revokedAt });
});

/**
 * DB 行を API レスポンス形状に整形する。
 * Serialise a DB row to the API response shape.
 */
function serializeInviteLink(row: typeof noteInviteLinks.$inferSelect) {
  return {
    id: row.id,
    note_id: row.noteId,
    token: row.token,
    role: row.role,
    created_by_user_id: row.createdByUserId,
    expires_at: row.expiresAt,
    max_uses: row.maxUses,
    used_count: row.usedCount,
    revoked_at: row.revokedAt,
    require_sign_in: row.requireSignIn,
    label: row.label,
    created_at: row.createdAt,
  };
}

export default app;
