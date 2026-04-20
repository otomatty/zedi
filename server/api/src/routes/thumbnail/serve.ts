import { Readable } from "node:stream";
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { authRequired } from "../../middleware/auth.js";
import { thumbnailObjects } from "../../schema/index.js";
import { getEnv } from "../../lib/env.js";
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

  const rows = await db
    .select()
    .from(thumbnailObjects)
    .where(and(eq(thumbnailObjects.id, objectId), eq(thumbnailObjects.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  // DB 削除を先に行い、所有者スコープの WHERE が一致した場合のみ S3 を削除する。
  // これにより (a) SELECT 後に所有権が変わった TOCTOU 窓では DB 削除が 0 行となり、
  // 他人の行に属する S3 オブジェクトを誤って消すことがない、(b) DB 行が残ったまま
  // S3 だけ消える不整合を回避できる。S3 削除が失敗した孤立オブジェクトは GC で回収可能。
  //
  // Delete the DB row first under an ownership-scoped WHERE and only touch S3 when
  // the row count confirms we owned it. Ownership changes during the TOCTOU window
  // show up as 0 rows deleted, so we surface 404 instead of wiping someone else's
  // storage object. Orphaned S3 objects from a post-DB failure are reclaimable by a
  // background sweeper — safer than the inverse (DB row pointing to missing blob).
  const deleted = await db
    .delete(thumbnailObjects)
    .where(and(eq(thumbnailObjects.id, objectId), eq(thumbnailObjects.userId, userId)))
    .returning({ s3Key: thumbnailObjects.s3Key });

  const deletedRow = deleted[0];
  if (!deletedRow) {
    // SELECT と DELETE の間で所有権が移動したか、並行して削除された。
    // Ownership changed (or the row was deleted concurrently) between SELECT and DELETE.
    return c.json({ error: "Not found" }, 404);
  }

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: deletedRow.s3Key,
      }),
    );
  } catch (err) {
    // DB 行は既に削除済み。NoSuchKey は冪等として無視し、他の失敗は
    // 孤立オブジェクトとしてログだけ残す（DB 行は復活させない）。
    //
    // DB row is already gone. Treat NoSuchKey as idempotent; log other failures
    // so ops can sweep the orphaned S3 object — do NOT resurrect the DB row.
    const s3Err = err as { name?: string } | null;
    if (s3Err?.name !== "NoSuchKey") {
      console.error("[thumbnail/serve] S3 DeleteObject failed after DB delete (orphaned object):", {
        objectId,
        s3Key: deletedRow.s3Key,
        err,
      });
    }
  }

  return c.json({ success: true });
});

export default app;
