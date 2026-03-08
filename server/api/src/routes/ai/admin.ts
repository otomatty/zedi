/**
 * AI 管理用エンドポイント（モデル一覧の同期・一覧・更新）
 * - モデル一覧/更新: セッション + admin ロール必須
 * - sync-models: X-Sync-Secret または セッション + admin
 */
import crypto from "crypto";
import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { auth } from "../../auth.js";
import { authRequired } from "../../middleware/auth.js";
import { adminRequired } from "../../middleware/adminAuth.js";
import { aiModels, type NewAiModel } from "../../schema/index.js";
import { users } from "../../schema/users.js";
import { syncAiModels, previewSyncAiModels } from "../../services/syncAiModels.js";
import type { AppEnv } from "../../types/index.js";

const SYNC_SECRET = process.env.SYNC_AI_MODELS_SECRET ?? "";

function secureCompare(a: string, b: string): boolean {
  if (!SYNC_SECRET) return false;
  const aHash = crypto.createHmac("sha256", SYNC_SECRET).update(a).digest();
  const bHash = crypto.createHmac("sha256", SYNC_SECRET).update(b).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

const app = new Hono<AppEnv>();

// --- Admin-only routes (session + role) ---
const adminApp = new Hono<AppEnv>();
adminApp.use("*", authRequired);
adminApp.use("*", adminRequired);

/** GET /api/ai/admin/models — 全モデル一覧（非アクティブ含む） */
adminApp.get("/models", async (c) => {
  const db = c.get("db");
  const rows = await db.select().from(aiModels).orderBy(asc(aiModels.sortOrder), asc(aiModels.id));
  return c.json({
    models: rows.map((m) => ({
      id: m.id,
      provider: m.provider,
      modelId: m.modelId,
      displayName: m.displayName,
      tierRequired: m.tierRequired,
      inputCostUnits: m.inputCostUnits,
      outputCostUnits: m.outputCostUnits,
      isActive: m.isActive,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt,
    })),
  });
});

/** PATCH /api/ai/admin/models/:id — モデル個別更新 */
adminApp.patch("/models/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>();
  const db = c.get("db");
  const updates: Partial<{
    displayName: string;
    tierRequired: "free" | "pro";
    inputCostUnits: number;
    outputCostUnits: number;
    isActive: boolean;
    sortOrder: number;
  }> = {};

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== "string")
      return c.json({ error: "displayName must be a string" }, 400);
    updates.displayName = body.displayName;
  }
  if (body.tierRequired !== undefined) {
    if (body.tierRequired !== "free" && body.tierRequired !== "pro")
      return c.json({ error: "tierRequired must be 'free' or 'pro'" }, 400);
    updates.tierRequired = body.tierRequired;
  }
  if (body.inputCostUnits !== undefined) {
    if (typeof body.inputCostUnits !== "number")
      return c.json({ error: "inputCostUnits must be a number" }, 400);
    updates.inputCostUnits = body.inputCostUnits;
  }
  if (body.outputCostUnits !== undefined) {
    if (typeof body.outputCostUnits !== "number")
      return c.json({ error: "outputCostUnits must be a number" }, 400);
    updates.outputCostUnits = body.outputCostUnits;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean")
      return c.json({ error: "isActive must be a boolean" }, 400);
    updates.isActive = body.isActive;
  }
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== "number")
      return c.json({ error: "sortOrder must be a number" }, 400);
    updates.sortOrder = body.sortOrder;
  }

  if (Object.keys(updates).length === 0) {
    const [row] = await db.select().from(aiModels).where(eq(aiModels.id, id)).limit(1);
    if (!row) return c.json({ error: "Not found", id }, 404);
    return c.json({ model: row });
  }
  const result = await db.update(aiModels).set(updates).where(eq(aiModels.id, id)).returning();
  if (result.length === 0) return c.json({ error: "Not found", id }, 404);
  return c.json({ model: result[0] });
});

/** PATCH /api/ai/admin/models/bulk — 一括更新（isActive, tierRequired, sortOrder, displayName） */
adminApp.patch("/models/bulk", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();

  if (!Array.isArray(body.updates)) {
    return c.json({ error: "updates must be an array" }, 400);
  }

  type BulkUpdateSet = Partial<
    Pick<NewAiModel, "displayName" | "tierRequired" | "isActive" | "sortOrder">
  >;
  const db = c.get("db");
  const updatedModels = await db.transaction(async (tx) => {
    const updated: unknown[] = [];
    for (const u of body.updates as Array<Record<string, unknown>>) {
      if (!u.id || typeof u.id !== "string") continue;
      const set: BulkUpdateSet = {};
      if (u.displayName !== undefined) {
        if (typeof u.displayName !== "string") continue;
        set.displayName = u.displayName;
      }
      if (u.tierRequired !== undefined) {
        if (u.tierRequired !== "free" && u.tierRequired !== "pro") continue;
        set.tierRequired = u.tierRequired;
      }
      if (u.isActive !== undefined) {
        if (typeof u.isActive !== "boolean") continue;
        set.isActive = u.isActive;
      }
      if (u.sortOrder !== undefined) {
        if (typeof u.sortOrder !== "number") continue;
        set.sortOrder = u.sortOrder;
      }
      if (Object.keys(set).length === 0) continue;
      const result = await tx.update(aiModels).set(set).where(eq(aiModels.id, u.id)).returning();
      if (result.length > 0) updated.push(result[0]);
    }
    return updated;
  });
  return c.json({ updated: updatedModels.length, models: updatedModels });
});

/** POST /api/ai/admin/sync-models/preview — 同期プレビュー（追加されるモデルのみ返す） */
adminApp.post("/sync-models/preview", async (c) => {
  try {
    const db = c.get("db");
    const results = await previewSyncAiModels(db);
    return c.json({ results });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[api] POST /api/ai/admin/sync-models/preview failed:", err.message);
    const isDev = process.env.NODE_ENV !== "production";
    return c.json(
      {
        error: "Preview failed",
        code: "PREVIEW_ERROR",
        message: isDev ? err.message : "An internal error occurred.",
        ...(isDev && err.stack ? { detail: err.stack } : {}),
      },
      500,
    );
  }
});

app.route("/", adminApp);

// --- sync-models: X-Sync-Secret または セッション+admin ---
app.get("/sync-models", (c) => {
  return c.json(
    {
      error: "Method Not Allowed",
      code: "METHOD_NOT_ALLOWED",
      message: "Use POST to run sync. Include header: X-Sync-Secret or sign in as admin.",
      path: c.req.path,
    },
    405,
  );
});

app.post("/sync-models", async (c) => {
  let allowed = false;

  const headerSecret = c.req.header("X-Sync-Secret");
  if (
    SYNC_SECRET &&
    headerSecret !== undefined &&
    headerSecret !== "" &&
    secureCompare(headerSecret, SYNC_SECRET)
  ) {
    allowed = true;
  }

  if (!allowed) {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session?.user?.id) {
        return c.json(
          {
            error: "Unauthorized",
            code: "UNAUTHORIZED",
            message: "Sign in or provide X-Sync-Secret.",
          },
          401,
        );
      }
      const db = c.get("db");
      const [row] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
      if (row?.role !== "admin") {
        return c.json(
          { error: "Forbidden", code: "FORBIDDEN", message: "Admin role required." },
          403,
        );
      }
      allowed = true;
    } catch {
      return c.json(
        {
          error: "Unauthorized",
          code: "UNAUTHORIZED",
          message: "Sign in or provide X-Sync-Secret.",
        },
        401,
      );
    }
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
        message: isDev ? err.message : "An internal error occurred while syncing models.",
        ...(isDev && err.stack ? { detail: err.stack } : {}),
      },
      500,
    );
  }
});

export default app;
