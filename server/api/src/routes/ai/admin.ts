/**
 * AI 管理用エンドポイント（モデル一覧の同期など）
 * Railway 上で実行するため、内部 DB (postgres.railway.internal) に接続できる。
 */
import crypto from "crypto";
import { Hono } from "hono";
import { syncAiModels } from "../../services/syncAiModels.js";
import type { AppEnv } from "../../types/index.js";

const SYNC_SECRET = process.env.SYNC_AI_MODELS_SECRET ?? "";

function secureCompare(a: string, b: string): boolean {
  const aHash = crypto.createHmac("sha256", "sync-secret").update(a).digest();
  const bHash = crypto.createHmac("sha256", "sync-secret").update(b).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

const app = new Hono<AppEnv>();

/** GET で叩かれた場合はメソッド案内を返す */
app.get("/sync-models", (c) => {
  return c.json(
    {
      error: "Method Not Allowed",
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST to run sync. Include header: X-Sync-Secret",
      path: c.req.path,
    },
    405,
  );
});

app.post("/sync-models", async (c) => {
  if (!SYNC_SECRET) {
    return c.json(
      {
        error: "Sync not configured",
        code: "SYNC_SECRET_NOT_SET",
        message:
          "SYNC_AI_MODELS_SECRET is not set. Add it in Railway Variables to enable this endpoint.",
      },
      501,
    );
  }

  const headerSecret = c.req.header("X-Sync-Secret");
  if (headerSecret === undefined || headerSecret === "") {
    return c.json(
      {
        error: "Missing secret",
        code: "SYNC_SECRET_MISSING",
        message: "Request header X-Sync-Secret is required.",
      },
      401,
    );
  }
  if (!secureCompare(headerSecret, SYNC_SECRET)) {
    return c.json(
      {
        error: "Invalid secret",
        code: "SYNC_SECRET_INVALID",
        message: "X-Sync-Secret does not match SYNC_AI_MODELS_SECRET.",
      },
      401,
    );
  }

  try {
    const db = c.get("db");
    const results = await syncAiModels(db);
    return c.json({ ok: true, results });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[api] POST /api/ai/admin/sync-models failed:", err.message, err);
    const isDev = process.env.NODE_ENV !== "production";
    return c.json(
      {
        error: "Sync failed",
        code: "SYNC_ERROR",
        message: err.message,
        ...(isDev && err.stack ? { detail: err.stack } : {}),
      },
      500,
    );
  }
});

export default app;
