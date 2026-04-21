/**
 * ノートのドメイン招待（domain-scoped access）管理ルート（Phase 6: #663）。
 *
 * POST   /:noteId/domain-access          — ドメインルール追加 (owner only)
 * GET    /:noteId/domain-access          — 一覧 (owner / editor)
 * DELETE /:noteId/domain-access/:id      — 削除 (owner only)
 *
 * Domain-scoped access management routes for notes (Phase 6 — issue #663).
 *
 * Rules are *not* persisted into `note_members`; they are "rules", not
 * "memberships". Deleting a rule therefore immediately revokes access for
 * every user who was relying on it (see `getNoteRole` in `helpers.ts`).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, eq } from "drizzle-orm";
import { noteDomainAccess } from "../../schema/index.js";
import { authRequired } from "../../middleware/auth.js";
import { recordAuditLog } from "../../lib/auditLog.js";
import { normalizeDomainInput } from "../../lib/freeEmailDomains.js";
import type { AppEnv } from "../../types/index.js";
import { getNoteRole, requireNoteOwner } from "./helpers.js";

const app = new Hono<AppEnv>();

/** 許容されるロール / Roles accepted for domain rules. */
type DomainRole = "viewer" | "editor";

/**
 * POST / PUT で受け取る生ボディ。Hono の `c.req.json` は `any` を返すので、
 * 期待する形を明示した interface にしてから分解する。
 *
 * Raw body shape accepted by the POST endpoint. Declared explicitly so we can
 * read each field through a narrow surface instead of `any`.
 */
interface CreateDomainAccessBody {
  domain?: unknown;
  role?: unknown;
}

/**
 * `role` 入力を `viewer` / `editor` に絞る。未指定時は `viewer`。
 * Narrow the role input to `viewer`/`editor`, defaulting to `viewer`.
 */
function validateRole(input: unknown): DomainRole {
  if (input === undefined || input === null) return "viewer";
  if (input !== "viewer" && input !== "editor") {
    throw new HTTPException(400, { message: "role must be 'viewer' or 'editor'" });
  }
  return input;
}

/**
 * `note_domain_access` の DB 行を snake_case の API レスポンスに整形する。
 * 他ルートの慣習（`noteRowToApi` など）に合わせて最小限の変換だけ行う。
 *
 * Serialise a `note_domain_access` row to the snake_case API shape used
 * elsewhere in `/api/notes`.
 */
function serializeDomainAccess(row: typeof noteDomainAccess.$inferSelect) {
  return {
    id: row.id,
    note_id: row.noteId,
    domain: row.domain,
    role: row.role,
    created_by_user_id: row.createdByUserId,
    verified_at: row.verifiedAt,
    created_at: row.createdAt,
  };
}

// ── POST /:noteId/domain-access ────────────────────────────────────────────

app.post("/:noteId/domain-access", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  await requireNoteOwner(db, noteId, userId, "Only the owner can add domain access rules");

  let body: CreateDomainAccessBody = {};
  const raw = await c.req.text();
  if (raw.trim().length > 0) {
    try {
      body = JSON.parse(raw) as CreateDomainAccessBody;
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
  }

  const normalized = normalizeDomainInput(body.domain);
  if (!normalized.ok) {
    switch (normalized.error.kind) {
      case "empty":
        throw new HTTPException(400, { message: "domain is required" });
      case "invalid_format":
        throw new HTTPException(400, { message: "domain has an invalid format" });
      case "free_email":
        // フリーメール (gmail.com 等) は拒否する。UI でも事前警告する想定。
        // Free-webmail providers are rejected; UI warns before POST as well.
        throw new HTTPException(400, {
          message: `domain '${normalized.error.domain}' is a free email provider and cannot be used for domain access`,
        });
    }
  }

  const role = validateRole(body.role);

  // 追加と監査ログを同一トランザクションで記録する。`ON CONFLICT` で
  // 同一 `(noteId, domain)` の削除済み行を復活 + ロール更新する。
  //
  // Insert and audit-log in one transaction. `ON CONFLICT` on the unique
  // `(noteId, domain)` resurrects previously soft-deleted rows and updates
  // the role for active ones.
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(noteDomainAccess)
      .values({
        noteId,
        domain: normalized.domain,
        role,
        createdByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [noteDomainAccess.noteId, noteDomainAccess.domain],
        set: {
          role,
          isDeleted: false,
          createdByUserId: userId,
        },
      })
      .returning();

    if (!row) {
      throw new HTTPException(500, { message: "Failed to create domain access rule" });
    }

    await recordAuditLog(c, tx, {
      action: "note.domain.created",
      targetType: "note",
      targetId: noteId,
      after: {
        domain_access_id: row.id,
        domain: row.domain,
        role: row.role,
      },
    });

    return row;
  });

  return c.json(serializeDomainAccess(created), 201);
});

// ── GET /:noteId/domain-access ─────────────────────────────────────────────

app.get("/:noteId/domain-access", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  // `getNoteRole` は存在しないノートに対して `{ role: null, note: null }` を
  // 返すので、404 と 403 を混同しないよう `note` を先に検査する。
  //
  // Guard `!note` first so missing notes return 404 instead of 403.
  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) {
    throw new HTTPException(404, { message: "Note not found" });
  }
  if (role !== "owner" && role !== "editor") {
    throw new HTTPException(403, {
      message: "Only owner or editor can list domain access rules",
    });
  }

  const rows = await db
    .select()
    .from(noteDomainAccess)
    .where(and(eq(noteDomainAccess.noteId, noteId), eq(noteDomainAccess.isDeleted, false)))
    .orderBy(asc(noteDomainAccess.createdAt));

  return c.json(rows.map(serializeDomainAccess));
});

// ── DELETE /:noteId/domain-access/:id ──────────────────────────────────────

app.delete("/:noteId/domain-access/:id", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const accessId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  await requireNoteOwner(db, noteId, userId, "Only the owner can remove domain access rules");

  // 論理削除 + 監査ログを同一トランザクションで扱う。ドメインルールの削除は
  // 「このドメインからのアクセスを即座に失効させる」操作なので、キャッシュは
  // 持たず、次回の `getNoteRole` で `isDeleted=false` の行が無ければ拒否される。
  //
  // Soft-delete and audit-log atomically. Because `getNoteRole` re-queries
  // domain rules live (no cache), flipping `isDeleted=true` immediately cuts
  // off any caller who was relying on this rule.
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(noteDomainAccess)
      .set({ isDeleted: true })
      .where(
        and(
          eq(noteDomainAccess.id, accessId),
          eq(noteDomainAccess.noteId, noteId),
          eq(noteDomainAccess.isDeleted, false),
        ),
      )
      .returning();

    if (!row) {
      throw new HTTPException(404, { message: "Domain access rule not found" });
    }

    await recordAuditLog(c, tx, {
      action: "note.domain.deleted",
      targetType: "note",
      targetId: noteId,
      before: {
        domain_access_id: row.id,
        domain: row.domain,
        role: row.role,
      },
    });

    return row;
  });

  return c.json({ removed: true, id: updated.id });
});

export default app;
