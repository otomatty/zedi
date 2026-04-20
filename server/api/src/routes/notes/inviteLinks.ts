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
 *
 * Request body schema:
 * - role:          only `'viewer'` is allowed in Phase 3
 * - expiresInMs:   ms until expiry (default 7 days, max 90 days)
 * - maxUses:       redemption cap 1..100 (null = unlimited)
 * - label:         free-form housekeeping label (optional)
 * - requireSignIn: whether sign-in is required to redeem (default true)
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

  // 空ボディは仕様上すべてデフォルト適用で OK だが、`{bad json}` のような不正な
  // JSON までデフォルト扱いにすると、クライアントバグを静かに握り潰してしまう
  // (#672 review: 'Invalid JSON body' は 400 として明示的に返す)。
  // Allow empty bodies (defaults apply) but reject genuinely malformed JSON so
  // client bugs surface as 400 instead of silently becoming an empty-body create.
  let body: CreateInviteLinkBody = {};
  const raw = await c.req.text();
  if (raw.trim().length > 0) {
    try {
      body = JSON.parse(raw) as CreateInviteLinkBody;
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
  }
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

  // `getNoteRole` は存在しないノートを `{ role: null, note: null }` で返すため、
  // 先に `note` の有無を検査しないと 404 が 403 として出てしまう
  // (#672 review #3109660808 — notes/members.ts と同じパターン)。
  // Guard `!note` first so missing notes return 404 rather than 403.
  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) {
    throw new HTTPException(404, { message: "Note not found" });
  }
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
