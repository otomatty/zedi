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
 * - role:         'viewer' | 'editor'（Phase 5 / #662 で editor を追加）
 *                  editor は `editPermission='owner_only'` のノートでは 400 となり、
 *                  1 ノートにつき同時 3 本までしか発行できない
 * - expiresInMs:  有効期限までのミリ秒（省略時 7 日、最大 90 日）
 * - maxUses:      利用上限 1..100（null = 無制限）
 * - label:        棚卸し用ラベル（任意）
 * - requireSignIn: サインイン必須フラグ。viewer は `false` を拒否、editor は
 *                   API 境界で常に `true` に上書きされる
 *
 * Request body schema:
 * - role:          `'viewer'` or `'editor'` (editor added in Phase 5 / #662).
 *                  Editor is rejected with 400 when `editPermission='owner_only'`
 *                  and capped at 3 concurrent active links per note.
 * - expiresInMs:   ms until expiry (default 7 days, max 90 days)
 * - maxUses:       redemption cap 1..100 (null = unlimited)
 * - label:         free-form housekeeping label (optional)
 * - requireSignIn: Viewer rejects `false`; editor silently coerces to `true`.
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
  // 事前に高速失敗させる。ただしこれはプリトランザクション時点のスナップショット
  // に対するチェックなので、tx 内でロック済みの行からもう一度読み直す（#676
  // review coderabbit）。ここでの早期拒否はあくまで「よくある無効リクエストを
  // 安いパスで返す」ための最適化。
  //
  // Fast-fail for the common owner_only case using the pre-transaction
  // snapshot. The authoritative check happens inside the transaction against
  // the row-locked copy to close the race where `edit_permission` flips to
  // `owner_only` between this read and the insert (#676 review coderabbit).
  if (normalized.role === "editor" && note.editPermission === "owner_only") {
    throw new HTTPException(400, {
      message:
        "Cannot create an editor invite link for a note whose edit permission is 'owner_only'",
    });
  }

  const token = generateInviteLinkToken();

  // 発行・権限/上限チェック・監査ログは同一トランザクションにまとめる。
  //
  // editor リンクでは対象ノート行を `SELECT ... FOR UPDATE` でロックし、その行
  // から `editPermission` を再読する。これにより、プリトランザクション時点の
  // スナップショットが古くなっていても、ロック済みの最新値で権限をチェック
  // できる（#676 review coderabbit）。同じロックで 3 本上限の count → insert も
  // 直列化する（#676 review: devin / codex / gemini / coderabbit）。
  //
  // count の where には「未取り消し・未期限切れ・未枯渇」を全て満たすリンクのみ
  // を集計する。`maxUses` を使い切ったリンクは実質無効なので、カウントから外して
  // オーナーが代替リンクを発行できるようにする（#676 review coderabbit）。
  //
  // Inside the transaction, lock the note row and re-read `editPermission`
  // from the locked copy so we can't race against a concurrent policy change
  // (#676 review coderabbit). The same lock serialises the count → insert for
  // the 3-link cap. The count filter excludes revoked, expired, and exhausted
  // links so unusable ones do not block replacements.
  const created = await db.transaction(async (tx) => {
    if (normalized.role === "editor") {
      // ノート行を FOR UPDATE でロックしつつ `editPermission` を再取得。
      // 行が消えていた場合は 404、`owner_only` に変わっていた場合は 400 に落とす。
      // Lock the note row and re-read `editPermission` so the authoritative
      // check runs against the row-locked copy, not the stale outer snapshot.
      const [lockedNote] = await tx
        .select({
          id: notes.id,
          editPermission: notes.editPermission,
        })
        .from(notes)
        .where(eq(notes.id, noteId))
        .for("update");

      if (!lockedNote) {
        throw new HTTPException(404, { message: "Note not found" });
      }
      if (lockedNote.editPermission === "owner_only") {
        throw new HTTPException(400, {
          message:
            "Cannot create an editor invite link for a note whose edit permission is 'owner_only'",
        });
      }

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
