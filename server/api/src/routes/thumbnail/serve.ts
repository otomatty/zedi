import { Readable } from "node:stream";
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { authRequired } from "../../middleware/auth.js";
import { thumbnailObjects } from "../../schema/index.js";
import { getEnv } from "../../lib/env.js";
import type { AppEnv } from "../../types/index.js";

const s3 = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT,
  region: "auto",
  credentials: {
    accessKeyId: getEnv("STORAGE_ACCESS_KEY"),
    secretAccessKey: getEnv("STORAGE_SECRET_KEY"),
  },
  forcePathStyle: true,
});

const BUCKET = getEnv("STORAGE_BUCKET_NAME");

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
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  const contentType = mimeTypes[ext] ?? "image/jpeg";

  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: row.s3Key }));
  const body = response.Body;
  if (!body) return c.json({ error: "Object not found" }, 404);

  const webStream = body instanceof Readable ? Readable.toWeb(body) : (body as ReadableStream);
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

app.delete("/:id", authRequired, async (c) => {
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

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: row.s3Key,
    }),
  );

  await db.delete(thumbnailObjects).where(eq(thumbnailObjects.id, objectId));

  return c.json({ success: true });
});

export default app;
