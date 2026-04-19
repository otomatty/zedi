import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq, sql } from "drizzle-orm";
import { thumbnailObjects, thumbnailTierQuotas } from "../schema/index.js";
import { getUserTier } from "./subscriptionService.js";
import { getEnv } from "../lib/env.js";
import type { Database } from "../types/index.js";

const s3 = new S3Client({
  endpoint: getEnv("STORAGE_ENDPOINT"),
  region: "auto",
  credentials: {
    accessKeyId: getEnv("STORAGE_ACCESS_KEY"),
    secretAccessKey: getEnv("STORAGE_SECRET_KEY"),
  },
  forcePathStyle: true,
});

async function getStorageQuotaBytes(tier: string, db: Database): Promise<number> {
  const rows = await db
    .select({ storageLimitBytes: thumbnailTierQuotas.storageLimitBytes })
    .from(thumbnailTierQuotas)
    .where(eq(thumbnailTierQuotas.tier, tier))
    .limit(1);
  return rows[0]?.storageLimitBytes ?? 10 * 1024 * 1024;
}

async function getStorageUsedBytes(userId: string, db: Database): Promise<number> {
  const rows = await db
    .select({
      sum: sql<string>`COALESCE(SUM(${thumbnailObjects.sizeBytes}), 0)::text`,
    })
    .from(thumbnailObjects)
    .where(eq(thumbnailObjects.userId, userId));
  return Number(rows[0]?.sum ?? 0);
}

async function fetchImageAsBuffer(
  sourceUrl: string,
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match?.[1] || !match[2]) throw new Error("Invalid data URI");
    const mimeType = match[1];
    const base64 = match[2];
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
  const contentTypePart = contentType.split(";")[0];
  const mimeType = (contentTypePart ?? contentType).trim();
  const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
  return { buffer, mimeType, ext };
}

/**
 *
 */
export async function commitImage(
  userId: string,
  sourceUrl: string,
  fallbackUrl: string | undefined,
  db: Database,
): Promise<{ imageUrl: string }> {
  /**
   *
   */
  let buffer: Buffer;
  /**
   *
   */
  let mimeType: string;
  /**
   *
   */
  let ext: string;

  try {
    /**
     *
     */
    const result = await fetchImageAsBuffer(sourceUrl);
    buffer = result.buffer;
    mimeType = result.mimeType;
    ext = result.ext;
  } catch (err) {
    if (fallbackUrl && fallbackUrl !== sourceUrl) {
      /**
       *
       */
      const fallback = await fetchImageAsBuffer(fallbackUrl);
      buffer = fallback.buffer;
      mimeType = fallback.mimeType;
      ext = fallback.ext;
    } else {
      throw err;
    }
  }

  /**
   *
   */
  const sizeBytes = buffer.length;
  /**
   *
   */
  const tier = await getUserTier(userId, db);
  /**
   *
   */
  const quotaBytes = await getStorageQuotaBytes(tier, db);
  /**
   *
   */
  const usedBytes = await getStorageUsedBytes(userId, db);

  if (usedBytes + sizeBytes > quotaBytes) {
    throw new Error("STORAGE_QUOTA_EXCEEDED");
  }

  /**
   *
   */
  const objectId = crypto.randomUUID();
  /**
   *
   */
  const s3Key = `users/${userId}/thumbnails/${objectId}.${ext}`;
  /**
   *
   */
  const bucketName = process.env.STORAGE_BUCKET_NAME;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  await db.insert(thumbnailObjects).values({
    id: objectId,
    userId,
    s3Key,
    sizeBytes,
  });

  // バケット非公開のため、API 経由でプロキシストリーミングする URL を返す
  // Return a proxy-streaming URL served via this API because the bucket is private.
  // BETTER_AUTH_URL は必須。未設定なら fail-fast し、不正な相対 URL を返さない。
  // BETTER_AUTH_URL is required; fail fast on missing value instead of returning a broken relative URL.
  /**
   *
   */
  const baseUrl = getEnv("BETTER_AUTH_URL").replace(/\/$/, "");
  return { imageUrl: `${baseUrl}/api/thumbnail/serve/${objectId}` };
}
