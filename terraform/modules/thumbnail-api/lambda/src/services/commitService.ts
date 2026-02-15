/**
 * Commit: fetch image, check quota, upload to S3, record in DB, return CloudFront URL
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { execute } from "../lib/db.js";
import { getSubscription } from "./subscriptionService.js";
import type { EnvConfig } from "../types/index.js";

const s3 = new S3Client({});

interface ThumbnailQuota {
  tier: string;
  storage_limit_bytes: number;
}

export async function getStorageQuotaBytes(tier: string, env: EnvConfig): Promise<number> {
  const rows = await execute<ThumbnailQuota>(
    "SELECT tier, storage_limit_bytes FROM thumbnail_tier_quotas WHERE tier = :tier",
    { tier },
    env
  );
  if (rows.length === 0) return 10 * 1024 * 1024; // default 10 MB
  return Number(rows[0].storage_limit_bytes);
}

export async function getStorageUsedBytes(userId: string, env: EnvConfig): Promise<number> {
  const rows = await execute<{ sum: string }>(
    "SELECT COALESCE(SUM(size_bytes), 0)::text AS sum FROM thumbnail_objects WHERE user_id = CAST(:userId AS uuid)",
    { userId },
    env
  );
  return Number(rows[0]?.sum ?? 0);
}

async function fetchImageAsBuffer(sourceUrl: string): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URI");
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
  const mimeType = contentType.split(";")[0].trim();
  const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
  return { buffer, mimeType, ext };
}

export async function commitImage(
  userId: string,
  sourceUrl: string,
  fallbackUrl: string | undefined,
  env: EnvConfig
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

  const subscription = await getSubscription(userId, env);
  const tier = subscription?.plan ?? "free";
  const quotaBytes = await getStorageQuotaBytes(tier, env);
  const usedBytes = await getStorageUsedBytes(userId, env);

  if (usedBytes + sizeBytes > quotaBytes) {
    throw new Error("STORAGE_QUOTA_EXCEEDED");
  }

  const objectId = crypto.randomUUID();
  const s3Key = `users/${userId}/thumbnails/${objectId}.${ext}`;
  const bucket = env.THUMBNAIL_BUCKET;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  await execute(
    `INSERT INTO thumbnail_objects (id, user_id, s3_key, size_bytes, created_at)
     VALUES (CAST(:id AS uuid), CAST(:userId AS uuid), :s3Key, :sizeBytes, NOW())`,
    { id: objectId, userId, s3Key, sizeBytes },
    env
  );

  const baseUrl = env.THUMBNAIL_CLOUDFRONT_URL.replace(/\/$/, "");
  const imageUrl = `${baseUrl}/${s3Key}`;

  return { imageUrl };
}
