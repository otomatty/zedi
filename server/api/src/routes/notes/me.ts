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
import { authRequired } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import { ensureDefaultNote } from "../../services/defaultNoteService.js";
import { noteRowToApi } from "./helpers.js";

const app = new Hono<AppEnv>();

app.get("/me", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const note = await ensureDefaultNote(db, userId);
  return c.json(noteRowToApi(note));
});

export default app;
