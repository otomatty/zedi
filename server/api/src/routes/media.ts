import { Readable } from "node:stream";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and } from "drizzle-orm";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
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
 * `<video>` タグで安全にインライン再生できる動画 MIME。
 * Safe video MIME types for inline `<video>` playback.
 */
const SAFE_INLINE_VIDEO_TYPES = new Set(["video/webm", "video/mp4"]);

/**
 * アップロードを許可する MIME（画像 + 動画）。
 * Allowlisted MIME types for upload (images + videos).
 */
const ALLOWED_UPLOAD_TYPES = new Set([...SAFE_INLINE_IMAGE_TYPES, ...SAFE_INLINE_VIDEO_TYPES]);

/** 最大アップロードサイズ（バイト）。動画も含め 50MB まで。 */
/** Maximum upload size in bytes (50MB), applies to images and videos alike. */
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

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
  if (
    declared &&
    (SAFE_INLINE_IMAGE_TYPES.has(declared) || SAFE_INLINE_VIDEO_TYPES.has(declared))
  ) {
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

  const normalizedMime = normalizeMimeBase(body.content_type);
  if (!normalizedMime || !ALLOWED_UPLOAD_TYPES.has(normalizedMime)) {
    throw new HTTPException(415, { message: "Unsupported media type" });
  }

  if (typeof body.file_size === "number" && body.file_size > MAX_UPLOAD_SIZE_BYTES) {
    throw new HTTPException(413, { message: "File exceeds 50MB upload limit" });
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

  const normalizedMime = normalizeMimeBase(body.content_type);
  if (!normalizedMime || !ALLOWED_UPLOAD_TYPES.has(normalizedMime)) {
    throw new HTTPException(415, { message: "Unsupported media type" });
  }

  if (typeof body.file_size === "number" && body.file_size > MAX_UPLOAD_SIZE_BYTES) {
    throw new HTTPException(413, { message: "File exceeds 50MB upload limit" });
  }

  const expectedPrefix = `users/${userId}/media/${body.media_id}/`;
  if (
    typeof body.s3_key !== "string" ||
    !body.s3_key.startsWith(expectedPrefix) ||
    body.s3_key.split("/").some((seg) => seg === ".." || seg === ".")
  ) {
    throw new HTTPException(403, { message: "Invalid S3 key" });
  }

  // クライアントから渡される `file_size` は偽装可能なので、実際に S3 にアップロード
  // された ContentLength を HeadObject で検証する。制限超過なら DB に記録する前に
  // オブジェクトを削除して 413 を返す。
  //
  // `body.file_size` is client-supplied and therefore trust-boundary violating
  // on its own. Verify the true upload size via HeadObject and delete the
  // oversized object before persisting it to the DB, so an attacker who lies
  // about `file_size` cannot leave >50MB blobs attached to their account.
  let verifiedSize: number | null = null;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: body.s3_key }));
    const length = typeof head.ContentLength === "number" ? head.ContentLength : null;
    if (length !== null && length > MAX_UPLOAD_SIZE_BYTES) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: body.s3_key })).catch((err) => {
        console.warn("[media] failed to delete oversized upload", {
          s3Key: body.s3_key,
          err,
        });
      });
      throw new HTTPException(413, { message: "File exceeds 50MB upload limit" });
    }
    verifiedSize = length;
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    const meta = (err as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata;
    const code = meta?.httpStatusCode;
    const name = (err as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey" || code === 404) {
      throw new HTTPException(400, { message: "Upload was not completed (object not found)" });
    }
    console.error("[media] HeadObject failed on /confirm:", err);
    throw new HTTPException(502, { message: "Failed to verify upload" });
  }

  const result = await db
    .insert(media)
    .values({
      id: body.media_id,
      ownerId: userId,
      s3Key: body.s3_key,
      fileName: body.file_name ?? null,
      contentType: body.content_type ?? null,
      // クライアント申告ではなく HeadObject で確認した実サイズを記録する。
      // Persist the verified size from HeadObject, not the client-supplied value.
      fileSize: verifiedSize ?? body.file_size ?? null,
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

  // 動画の再生・シークは Range リクエスト（206 応答）を前提とするため、
  // クライアントが送ってきた `Range` ヘッダをそのまま S3 へ転送し、S3 が返した
  // ContentRange / ContentLength / 206 ステータスをそのままブラウザへ中継する。
  // 画像については Range を受けても元のまま（200）を返す。
  //
  // Video playback and seeking rely on Range requests (HTTP 206). Forward any
  // incoming `Range` header to S3 and relay the resulting Content-Range /
  // Content-Length / 206 status back to the browser. Images ignore Range and
  // continue to serve the full 200 response.
  const rangeHeader = c.req.raw.headers.get("Range") ?? undefined;

  let response;
  try {
    response = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: row.s3Key,
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      }),
    );
  } catch (err) {
    const meta = (err as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata;
    const code = meta?.httpStatusCode;
    const name = (err as { name?: string }).name;
    if (name === "NoSuchKey" || code === 404) {
      return c.json({ error: "Object not found" }, 404);
    }
    if (name === "InvalidRange" || code === 416) {
      return c.json({ error: "Requested range not satisfiable" }, 416);
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
    // ブラウザが seek 時に Range を送ってよいことを示す。画像にも付けても害は無い。
    // Signals that the browser may issue Range requests (harmless on images).
    "Accept-Ranges": "bytes",
  };
  if (contentDisposition) {
    headers["Content-Disposition"] = contentDisposition;
  }
  const len = response.ContentLength;
  if (typeof len === "number" && len >= 0) {
    headers["Content-Length"] = String(len);
  }
  if (response.ContentRange) {
    headers["Content-Range"] = response.ContentRange;
  }

  // S3 が部分応答を返した場合は 206 でそのまま返す。
  // Relay S3's partial-content responses as HTTP 206.
  const isPartial = response.ContentRange !== undefined || rangeHeader !== undefined;
  const status = isPartial && response.ContentRange ? 206 : 200;

  return new Response(webStream as BodyInit, {
    status,
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

  // DB 削除を先に行い、所有者スコープの WHERE が一致した場合のみ S3 を削除する。
  // これにより (a) SELECT 後に所有権が変わった TOCTOU 窓では DB 削除が 0 行となり、
  // 他人の行に属する S3 オブジェクトを誤って消すことがない、(b) DB 行と S3 オブジェクトの
  // 不整合（行は残っているのにオブジェクトだけ消える）を回避できる。DB 削除後に S3 削除が
  // 失敗した場合は孤立オブジェクトが残るが、これは後続の GC で回収可能なので DB 不整合より
  // 安全側に倒している。
  //
  // Delete the DB row first under an ownership-scoped WHERE, and only touch S3 when
  // the row count confirms we owned it. If ownership changed after the SELECT the
  // DELETE becomes a no-op (0 rows) and we surface 403 instead of silently wiping
  // someone else's storage object. An orphaned S3 object from a post-DB failure is
  // reclaimable by a background sweeper; an orphaned DB row pointing at missing
  // storage is not — so we accept the former, not the latter.
  const deleted = await db
    .delete(media)
    .where(and(eq(media.id, mediaId), eq(media.ownerId, userId)))
    .returning({ s3Key: media.s3Key });

  const deletedRow = deleted[0];
  if (!deletedRow) {
    // SELECT と DELETE の間で所有権が移動したか、並行して削除されたケース。
    // Ownership changed (or the row was deleted concurrently) between SELECT and DELETE.
    throw new HTTPException(403, { message: "You can only delete your own media" });
  }

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: deletedRow.s3Key,
      }),
    );
  } catch (err) {
    // DB 行は既に削除済み。NoSuchKey は冪等として無視し、それ以外の失敗は
    // 孤立オブジェクトとして警告だけ残す（DB と storage の再同期は別経路に任せる）。
    //
    // DB row is already gone. Treat NoSuchKey as idempotent; log other failures
    // so ops can sweep the orphaned S3 object — do NOT resurrect the DB row.
    const s3Err = err as { name?: string } | null;
    if (s3Err?.name !== "NoSuchKey") {
      console.error("[media] S3 DeleteObject failed after DB delete (orphaned object):", {
        mediaId,
        s3Key: deletedRow.s3Key,
        err,
      });
    }
  }

  return c.json({ success: true });
});

export default app;
