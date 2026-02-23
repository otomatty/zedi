/**
 * /api/media — メディアアップロード (S3 Presigned URL)
 *
 * POST /api/media/upload   — S3 presigned URL 取得
 * POST /api/media/confirm  — アップロード完了通知
 * GET  /api/media/:id      — メディア取得 (302 → S3 signed URL)
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { media } from "../schema";
import { getEnvConfig } from "../env";
import { authRequired } from "../middleware/auth";
import type { AppEnv } from "../types";

const s3 = new S3Client({});
const app = new Hono<AppEnv>();

// ── POST /media/upload ──────────────────────────────────────────────────────
app.post("/upload", authRequired, async (c) => {
  const userId = c.get("userId");
  const env = getEnvConfig();

  const body = await c.req.json<{
    file_name: string;
    content_type: string;
    file_size?: number;
    page_id?: string;
  }>();

  if (!body.file_name || !body.content_type) {
    throw new HTTPException(400, {
      message: "file_name and content_type are required",
    });
  }

  const mediaId = crypto.randomUUID();
  const s3Key = `users/${userId}/media/${mediaId}/${body.file_name}`;

  // Presigned PUT URL (15 分有効)
  const presignedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.MEDIA_BUCKET,
      Key: s3Key,
      ContentType: body.content_type,
    }),
    { expiresIn: 900 },
  );

  return c.json({
    upload_url: presignedUrl,
    media_id: mediaId,
    s3_key: s3Key,
  });
});

// ── POST /media/confirm ─────────────────────────────────────────────────────
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
    throw new HTTPException(400, {
      message: "media_id and s3_key are required",
    });
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

// ── GET /media/:id ──────────────────────────────────────────────────────────
app.get("/:id", authRequired, async (c) => {
  const mediaId = c.req.param("id");
  const db = c.get("db");
  const env = getEnvConfig();

  const result = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);

  if (!result.length) {
    throw new HTTPException(404, { message: "Media not found" });
  }

  const row = result[0];
  if (!row) throw new HTTPException(404, { message: "Media not found" });
  const signedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.MEDIA_BUCKET,
      Key: row.s3Key,
    }),
    { expiresIn: 3600 },
  );

  return c.redirect(signedUrl, 302);
});

export default app;
