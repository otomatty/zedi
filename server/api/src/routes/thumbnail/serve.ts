import { Readable } from "node:stream";
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { authRequired } from "../../middleware/auth.js";
import { thumbnailObjects } from "../../schema/index.js";
import { getEnv } from "../../lib/env.js";
import { deleteThumbnailObject } from "../../services/thumbnailGcService.js";
import type { AppEnv } from "../../types/index.js";

const s3 = new S3Client({
  endpoint: getEnv("STORAGE_ENDPOINT"),
  region: "auto",
  credentials: {
    accessKeyId: getEnv("STORAGE_ACCESS_KEY"),
    secretAccessKey: getEnv("STORAGE_SECRET_KEY"),
  },
  forcePathStyle: true,
});

const BUCKET = getEnv("STORAGE_BUCKET_NAME");

/** SVG は XSS リスクがあるためサムネイル配信では許可しない */
const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const app = new Hono<AppEnv>();

/**
 * GET /api/thumbnail/serve/:id — サムネイルをプロキシ配信
 * 302 リダイレクトだと credentials 付き fetch で CORS エラーになるため、
 * API で取得してストリーム返却（Storage の * と credentials の競合を回避）
 */
app.get("/:id", authRequired, async (c) => {
  const objectId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  const rows = await db
    .select()
    .from(thumbnailObjects)
    .where(and(eq(thumbnailObjects.id, objectId), eq(thumbnailObjects.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  const ext = row.s3Key.split(".").pop()?.toLowerCase() || "jpg";
  const contentType = MIME_TYPES[ext] ?? "image/jpeg";

  let response;
  try {
    response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: row.s3Key }));
  } catch (err) {
    const meta = (err as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata;
    const code = meta?.httpStatusCode;
    const name = (err as { name?: string }).name;
    if (name === "NoSuchKey" || code === 404) {
      return c.json({ error: "Object not found" }, 404);
    }
    console.error("[thumbnail/serve] S3 GetObject failed:", err);
    return c.json({ error: "Failed to retrieve object" }, 502);
  }

  const body = response.Body;
  if (!body) return c.json({ error: "Object not found" }, 404);

  const webStream = body instanceof Readable ? Readable.toWeb(body) : (body as ReadableStream);
  return new Response(webStream as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

app.delete("/:id", authRequired, async (c) => {
  const objectId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  // 共通 GC サービスに委譲する。サービスは所有者チェック → ライブ参照ガード →
  // DB 削除 → S3 削除を一貫した順序で実行する（issue #820）。
  //
  // Delegate to the shared GC service, which serializes ownership check,
  // live-reference guard, DB delete, and S3 delete (issue #820). The
  // ownership check is performed first so unauthorized callers always see
  // 404 — never 409 — and cannot probe other users' thumbnail state.
  const outcome = await deleteThumbnailObject(objectId, userId, db);

  if (outcome === "not_found") {
    return c.json({ error: "Not found" }, 404);
  }
  if (outcome === "referenced") {
    // ライブページがまだ参照しているため削除を拒否する。クライアントの誤発火
    // した rollback がライブページのサムネイルを消さないようにする。
    //
    // Refuse the delete because a live `pages` row still references this
    // thumbnail. This protects against a phantom client-side rollback fired
    // after a successful page commit but before the response was received.
    return c.json({ error: "Thumbnail is referenced by a live page" }, 409);
  }
  return c.json({ success: true });
});

export default app;
