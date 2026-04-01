import { Readable } from "node:stream";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { media } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import { getEnv } from "../lib/env.js";
import type { AppEnv } from "../types/index.js";

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

const app = new Hono<AppEnv>();

app.post("/upload", authRequired, async (c) => {
  const userId = c.get("userId");

  const body = await c.req.json<{
    file_name: string;
    content_type: string;
    file_size?: number;
    page_id?: string;
  }>();

  if (!body.file_name || !body.content_type) {
    throw new HTTPException(400, { message: "file_name and content_type are required" });
  }

  const mediaId = crypto.randomUUID();
  const s3Key = `users/${userId}/media/${mediaId}/${body.file_name}`;

  const presignedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: body.content_type,
    }),
    { expiresIn: 900 },
  );

  return c.json({ upload_url: presignedUrl, media_id: mediaId, s3_key: s3Key });
});

app.post("/confirm", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    media_id: string;
    s3_key: string;
    file_name: string;
    content_type: string;
    file_size?: number;
    page_id?: string;
  }>();

  if (!body.media_id || !body.s3_key) {
    throw new HTTPException(400, { message: "media_id and s3_key are required" });
  }

  const expectedPrefix = `users/${userId}/media/${body.media_id}/`;
  if (
    typeof body.s3_key !== "string" ||
    !body.s3_key.startsWith(expectedPrefix) ||
    body.s3_key.split("/").some((seg) => seg === ".." || seg === ".")
  ) {
    throw new HTTPException(403, { message: "Invalid S3 key" });
  }

  const result = await db
    .insert(media)
    .values({
      id: body.media_id,
      ownerId: userId,
      s3Key: body.s3_key,
      fileName: body.file_name ?? null,
      contentType: body.content_type ?? null,
      fileSize: body.file_size ?? null,
      pageId: body.page_id ?? null,
    })
    .returning();

  return c.json({ media: result[0] });
});

/**
 * GET /api/media/:id — メディアをプロキシ配信
 * 302 で presigned URL へ飛ばすと、ブラウザの credentials 付き fetch がストレージ側で CORS に阻まれることがあるため、
 * API 上で GetObject してストリーム返却する（サムネイル配信と同じ理由）。
 *
 * GET /api/media/:id — proxy media bytes through the API.
 * A 302 to a presigned URL can make credentialed browser fetches fail on storage CORS; stream from S3 here instead (same as thumbnails).
 */
app.get("/:id", authRequired, async (c) => {
  const mediaId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  const result = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);

  const row = result[0];
  if (!row) throw new HTTPException(404, { message: "Media not found" });
  if (row.ownerId !== userId) {
    throw new HTTPException(403, { message: "You can only access your own media" });
  }

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
    console.error("[media] S3 GetObject failed:", err);
    return c.json({ error: "Failed to retrieve object" }, 502);
  }

  const body = response.Body;
  if (!body) return c.json({ error: "Object not found" }, 404);

  const contentType = row.contentType ?? response.ContentType ?? "application/octet-stream";

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
  const mediaId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  const result = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);

  const row = result[0];
  if (!row) throw new HTTPException(404, { message: "Media not found" });
  if (row.ownerId !== userId) {
    throw new HTTPException(403, { message: "You can only delete your own media" });
  }

  await db.delete(media).where(eq(media.id, mediaId));

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: row.s3Key,
      }),
    );
  } catch (err) {
    console.error("[media] S3 DeleteObject failed:", err);
    throw new HTTPException(502, { message: "Failed to delete object from storage" });
  }

  return c.json({ success: true });
});

export default app;
