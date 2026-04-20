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
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { noteInviteLinks, notes } from "../../schema/index.js";
import { authRequired } from "../../middleware/auth.js";
import { recordAuditLog } from "../../lib/auditLog.js";
import type { AppEnv } from "../../types/index.js";
import { getNoteRole, requireNoteOwner } from "./helpers.js";
import {
  generateInviteLinkToken,
  MAX_ACTIVE_EDITOR_INVITE_LINKS_PER_NOTE,
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

  const note = await requireNoteOwner(db, noteId, userId, "Only the owner can create invite links");

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

  // editor リンクは `edit_permission = 'owner_only'` のノートと整合しないので
  // 事前に拒否する（ノート行は `requireNoteOwner` が取得済み）。
  // 「1 ノートにつき 3 本まで」の上限チェックと count はトランザクション内で
  // 行うため、ここでは editPermission の整合性だけ先に弾く。
  //
  // Editor links clash with `edit_permission = 'owner_only'`; reject early so
  // we don't even enter the transaction in that case. The 3-link cap is
  // enforced atomically inside the transaction below.
  if (normalized.role === "editor" && note.editPermission === "owner_only") {
    throw new HTTPException(400, {
      message:
        "Cannot create an editor invite link for a note whose edit permission is 'owner_only'",
    });
  }

  const token = generateInviteLinkToken();

  // 発行・上限チェック・監査ログは同一トランザクションにまとめる。
  //
  // editor リンクの 3 本上限チェックはトランザクション内で行い、対象ノート行を
  // `SELECT ... FOR UPDATE` でロックすることで、同時リクエスト間の TOCTOU を
  // 防ぐ（#676 review: devin / codex / gemini / coderabbit）。ロックは同一ノート
  // に対する editor リンク発行をシリアライズし、count → insert を原子的にする。
  //
  // count の where には「未取り消し・未期限切れ・未枯渇」を全て満たすリンクのみ
  // を集計する。`maxUses` を使い切ったリンクは実質無効なので、カウントから外して
  // オーナーが代替リンクを発行できるようにする（#676 review coderabbit）。
  //
  // Merge insert + audit + the cap check into one transaction. Acquire a
  // `SELECT ... FOR UPDATE` on the note row so concurrent editor-link creation
  // requests serialise on the same note and cannot both pass the count
  // check. The count filter excludes revoked, expired, and exhausted links
  // (`maxUses IS NULL OR usedCount < maxUses`) so unusable links do not block
  // issuance of replacements.
  const created = await db.transaction(async (tx) => {
    if (normalized.role === "editor") {
      // ノート行を FOR UPDATE でロック。対象ノートに対する editor リンク作成が
      // 直列化されるため、count → insert が競合しない。
      // Lock the note row so concurrent editor-link creations on the same
      // note are serialised.
      await tx.select({ id: notes.id }).from(notes).where(eq(notes.id, noteId)).for("update");

      const now = new Date();
      const [countRow] = await tx
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(noteInviteLinks)
        .where(
          and(
            eq(noteInviteLinks.noteId, noteId),
            eq(noteInviteLinks.role, "editor"),
            isNull(noteInviteLinks.revokedAt),
            gt(noteInviteLinks.expiresAt, now),
            // 枯渇したリンク（usedCount >= maxUses）は実質無効なのでカウント外。
            // Exclude exhausted links from the cap.
            sql`(${noteInviteLinks.maxUses} IS NULL OR ${noteInviteLinks.usedCount} < ${noteInviteLinks.maxUses})`,
          ),
        );
      const activeEditorCount = countRow?.count ?? 0;
      if (activeEditorCount >= MAX_ACTIVE_EDITOR_INVITE_LINKS_PER_NOTE) {
        throw new HTTPException(400, {
          message: `A note can have at most ${MAX_ACTIVE_EDITOR_INVITE_LINKS_PER_NOTE} active editor invite links`,
        });
      }
    }

    const [row] = await tx
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

    if (!row) {
      throw new HTTPException(500, { message: "Failed to create invite link" });
    }

    const action =
      normalized.role === "editor" ? "note.link.created.editor" : "note.link.created.viewer";
    await recordAuditLog(c, tx, {
      action,
      targetType: "note",
      targetId: noteId,
      after: {
        link_id: row.id,
        role: row.role,
        expires_at:
          row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
        max_uses: row.maxUses,
        require_sign_in: row.requireSignIn,
        label: row.label,
      },
    });
    return row;
  });

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
