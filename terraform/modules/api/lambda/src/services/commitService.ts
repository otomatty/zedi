/**
 * サムネイルコミットサービス — 画像取得 → S3 アップロード → DB 記録
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq, sql } from "drizzle-orm";
import { thumbnailObjects, thumbnailTierQuotas } from "../schema";
import { getUserTier } from "./subscriptionService";
import type { Database, EnvConfig } from "../types";

const s3 = new S3Client({});

/**
 * ティアごとのストレージクォータ (バイト) を取得
 */
async function getStorageQuotaBytes(tier: string, db: Database): Promise<number> {
  const rows = await db
    .select({ storageLimitBytes: thumbnailTierQuotas.storageLimitBytes })
    .from(thumbnailTierQuotas)
    .where(eq(thumbnailTierQuotas.tier, tier))
    .limit(1);

  return rows[0]?.storageLimitBytes ?? 10 * 1024 * 1024; // default 10 MB
}

/**
 * ユーザーの使用済みストレージ (バイト) を取得
 */
async function getStorageUsedBytes(userId: string, db: Database): Promise<number> {
  const rows = await db
    .select({
      sum: sql<string>`COALESCE(SUM(${thumbnailObjects.sizeBytes}), 0)::text`,
    })
    .from(thumbnailObjects)
    .where(eq(thumbnailObjects.userId, userId));

  return Number(rows[0]?.sum ?? 0);
}

/**
 * 画像を URL またはデータ URI から Buffer として取得
 */
async function fetchImageAsBuffer(
  sourceUrl: string,
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URI");
    const mimeType = match[1]!;
    const base64 = match[2]!;
    const buffer = Buffer.from(base64, "base64");
    const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
    return { buffer, mimeType, ext };
  }

  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
      Accept: "image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) {
    throw new Error("URL is not an image");
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = contentType.split(";")[0]!.trim();
  const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
  return { buffer, mimeType, ext };
}

/**
 * 画像をコミット: 取得 → クォータチェック → S3 アップロード → DB 記録
 */
export async function commitImage(
  userId: string,
  sourceUrl: string,
  fallbackUrl: string | undefined,
  env: EnvConfig,
  db: Database,
): Promise<{ imageUrl: string }> {
  let buffer: Buffer;
  let mimeType: string;
  let ext: string;

  try {
    const result = await fetchImageAsBuffer(sourceUrl);
    buffer = result.buffer;
    mimeType = result.mimeType;
    ext = result.ext;
  } catch (err) {
    if (fallbackUrl && fallbackUrl !== sourceUrl) {
      const fallback = await fetchImageAsBuffer(fallbackUrl);
      buffer = fallback.buffer;
      mimeType = fallback.mimeType;
      ext = fallback.ext;
    } else {
      throw err;
    }
  }

  const sizeBytes = buffer.length;

  // ストレージクォータチェック
  const tier = await getUserTier(userId, db);
  const quotaBytes = await getStorageQuotaBytes(tier, db);
  const usedBytes = await getStorageUsedBytes(userId, db);

  if (usedBytes + sizeBytes > quotaBytes) {
    throw new Error("STORAGE_QUOTA_EXCEEDED");
  }

  // S3 アップロード
  const objectId = crypto.randomUUID();
  const s3Key = `users/${userId}/thumbnails/${objectId}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.THUMBNAIL_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  // DB 記録
  await db.insert(thumbnailObjects).values({
    id: objectId,
    userId,
    s3Key,
    sizeBytes,
  });

  const baseUrl = env.THUMBNAIL_CLOUDFRONT_URL.replace(/\/$/, "");
  return { imageUrl: `${baseUrl}/${s3Key}` };
}
