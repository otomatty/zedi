/**
 * /api/notes/me — 呼び出し元のデフォルトノート（マイノート）を返す。
 *
 * GET /api/notes/me
 *   呼び出し元の `notes.is_default = true` の行を返す。未作成ならその場で
 *   `ensureDefaultNote` で作成する（idempotent）。フロントの `/notes/me`
 *   ランディングが最初に叩くエンドポイント。
 *
 * GET /api/notes/me — return the caller's default note ("マイノート"). If one
 * does not exist yet (e.g. a brand-new account), it is created on the fly.
 * The frontend `/notes/me` landing page hits this endpoint first.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { notes } from "../../schema/index.js";
import { authRequired } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import { ensureDefaultNote } from "../../services/defaultNoteService.js";
import { noteRowToApi } from "./helpers.js";

const app = new Hono<AppEnv>();

app.get("/me", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const noteId = await ensureDefaultNote(db, userId);

  const rows = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  const row = rows[0];
  if (!row) {
    // ensureDefaultNote が成功しているのにここで取れないのは整合性破壊。
    // ensureDefaultNote returned an id that no longer exists — invariant break.
    throw new HTTPException(500, { message: "Default note vanished" });
  }

  return c.json(noteRowToApi(row));
});

export default app;
