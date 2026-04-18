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

/**
 * api オリジンでバイトを返すため、ユーザー提供の Content-Type をそのまま使わない。
 * ブラウザが img で表示しやすいラスタ系のみインライン許可（SVG は XSS のため除外 — サムネイル配信と同様）。
 * AVIF/APNG などはアップロードで保存され得るため GET でも同じ扱いにする（/upload は file.type 依存のためここで広げる）。
 *
 * Do not reflect user-supplied Content-Type verbatim from the API origin.
 * Allow common safe raster types for inline display; exclude SVG (XSS — same as thumbnail/serve).
 * Include AVIF/APNG so GET matches types clients may store via `/upload`.
 */
const SAFE_INLINE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/apng",
  "image/bmp",
  "image/x-ms-bmp",
]);

/**
 * MIME 文字列からセミコロンより前の部分だけを小文字で返す。
 *
 * Returns the part before `;`, lowercased (e.g. `image/png; charset=binary` → `image/png`).
 *
 * @param raw - MIME string, possibly with parameters
 */
function normalizeMimeBase(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const base = raw.split(";")[0]?.trim().toLowerCase();
  return base || null;
}

/**
 * プロキシ応答用の Content-Type と、必要なら Content-Disposition（attachment）。
 *
 * Resolves safe `Content-Type` and optional `Content-Disposition` for proxied bytes.
 */
function resolveProxyContentHeaders(
  rowContentType: string | null | undefined,
  s3ContentType: string | undefined,
  fileName: string | null | undefined,
): { contentType: string; contentDisposition?: string } {
  const declared = normalizeMimeBase(rowContentType) ?? normalizeMimeBase(s3ContentType);
  if (declared && SAFE_INLINE_IMAGE_TYPES.has(declared)) {
    return { contentType: declared };
  }
  const safeFile =
    fileName
      ?.trim()
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 200) || "download";
  return {
    contentType: "application/octet-stream",
    contentDisposition: `attachment; filename="${safeFile}"`,
  };
}

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

  const { contentType, contentDisposition } = resolveProxyContentHeaders(
    row.contentType,
    response.ContentType,
    row.fileName,
  );

  const webStream = body instanceof Readable ? Readable.toWeb(body) : (body as ReadableStream);

  // Cookie セッション認可: ログアウト後の別アカウントで古いバイトが再利用されないよう no-store + Vary: Cookie
  // Cookie-auth: avoid serving stale cached bytes after logout or account switch
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  if (contentDisposition) {
    headers["Content-Disposition"] = contentDisposition;
  }
  const len = response.ContentLength;
  if (typeof len === "number" && len >= 0) {
    headers["Content-Length"] = String(len);
  }

  return new Response(webStream as BodyInit, {
    status: 200,
    headers,
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

  // ストレージ→DB の順で削除する。ストレージ側が失敗した場合に DB レコードだけ消えて
  // オブジェクトが孤児化するのを防ぐため。NoSuchKey 等の冪等エラーは DB 削除まで進める。
  //
  // Delete storage object before the DB row so a storage failure cannot leave an
  // orphaned object behind. Idempotent errors (NoSuchKey) still advance to DB delete.
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: row.s3Key,
      }),
    );
  } catch (err) {
    const meta = (err as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata;
    const code = meta?.httpStatusCode;
    const name = (err as { name?: string }).name;
    if (name !== "NoSuchKey" && code !== 404) {
      console.error("[media] S3 DeleteObject failed:", err);
      throw new HTTPException(502, { message: "Failed to delete object from storage" });
    }
  }

  await db.delete(media).where(eq(media.id, mediaId));

  return c.json({ success: true });
});

export default app;
