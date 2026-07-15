import { eq, sql } from "drizzle-orm";
import { thumbnailObjects, thumbnailTierQuotas } from "../schema/index.js";
import { getUserTier } from "./subscriptionService.js";
import { getEnv } from "../lib/env.js";
import { assertClipFetchUrlAllowed, ClipFetchBlockedError } from "../lib/clipServerFetch.js";
import type { StorageClient } from "../lib/storage/index.js";
import type { Database } from "../types/index.js";

const MAX_REDIRECTS = 5;

// `thumbnail_tier_quotas` がシードされていない環境でフォールバック上限が小さすぎると
// 数件クリップしただけで 413 を踏む。drizzle/0020_seed_thumbnail_tier_quotas.sql の
// free 行と同じ 100 MB に揃えておく。
// Fallback ceiling matches the `free` row seeded in
// drizzle/0020_seed_thumbnail_tier_quotas.sql (100 MB) so unseeded environments
// don't silently throttle every user to a handful of web clips.
const FALLBACK_QUOTA_BYTES = 100 * 1024 * 1024;

async function getStorageQuotaBytes(tier: string, db: Database): Promise<number> {
  const rows = await db
    .select({ storageLimitBytes: thumbnailTierQuotas.storageLimitBytes })
    .from(thumbnailTierQuotas)
    .where(eq(thumbnailTierQuotas.tier, tier))
    .limit(1);
  return rows[0]?.storageLimitBytes ?? FALLBACK_QUOTA_BYTES;
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

  // SSRF 対策: 初回 URL と各リダイレクト先を DNS 解決込みで検証する
  // (clip-fetch と同じポリシー)。redirect: "manual" で自動追従させない。
  // SSRF protection: validate the initial URL and every redirect hop with DNS
  // resolution (same policy as clip-fetch); manual redirects prevent
  // unvalidated auto-follow to internal hosts.
  await assertClipFetchUrlAllowed(sourceUrl);

  let response!: Response;
  let currentUrl = sourceUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "manual",
    });
    const isRedirect =
      response.type === "opaqueredirect" || [301, 302, 303, 307, 308].includes(response.status);
    if (isRedirect) {
      // リダイレクト応答の本文は読まないので接続を解放する。
      // Cancel unused redirect bodies so connections are released promptly.
      await response.body?.cancel();
      const location = response.headers.get("Location");
      if (!location || hop === MAX_REDIRECTS) {
        throw new ClipFetchBlockedError("Redirect chain not allowed");
      }
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).href;
      } catch {
        throw new ClipFetchBlockedError("Invalid redirect Location");
      }
      await assertClipFetchUrlAllowed(nextUrl);
      currentUrl = nextUrl;
      continue;
    }
    break;
  }

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
 * サムネイル画像を取得して S3 に保存し、プロキシ配信用の URL と保存した
 * thumbnail_objects 行の ID を返す。
 * Fetches a thumbnail image, persists it to S3, and returns the proxy URL plus
 * the persisted `thumbnail_objects.id`.
 *
 * バケットは非公開のため、`/api/thumbnail/serve/:id` 経由でストリーミング配信する。
 * `objectId` は呼び出し側がページ行に紐づけて削除時 GC で参照する。
 * The bucket is private, so the returned URL streams via `/api/thumbnail/serve/:id`.
 * Callers persist `objectId` on the owning page row so DELETE /pages/:id can GC
 * the S3 blob and DB row.
 *
 * 必須環境変数 `BETTER_AUTH_URL` は、副作用（S3 アップロード・DB 挿入）より前に
 * 検証する。未設定なら即座に throw し、オーファンなオブジェクトや行を残さない。
 * The required env var `BETTER_AUTH_URL` is validated before any side effects
 * (S3 upload, DB insert); if missing, we throw immediately so no orphan object
 * or row is persisted.
 *
 * @throws `STORAGE_QUOTA_EXCEEDED` when the user's tier quota is exhausted.
 * @throws `Missing required env var: BETTER_AUTH_URL` when the env var is unset.
 */
export async function commitImage(
  userId: string,
  sourceUrl: string,
  fallbackUrl: string | undefined,
  db: Database,
  storage: StorageClient,
): Promise<{ imageUrl: string; objectId: string }> {
  // BETTER_AUTH_URL は必須。S3 アップロードや DB 挿入より前に検証して fail-fast する。
  // Validate BETTER_AUTH_URL before any side effects so a missing env var cannot
  // leave orphan storage objects or DB rows.
  const baseUrl = getEnv("BETTER_AUTH_URL").replace(/\/$/, "");

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
  const tier = await getUserTier(userId, db);
  const quotaBytes = await getStorageQuotaBytes(tier, db);
  const usedBytes = await getStorageUsedBytes(userId, db);

  if (usedBytes + sizeBytes > quotaBytes) {
    throw new Error("STORAGE_QUOTA_EXCEEDED");
  }

  const objectId = crypto.randomUUID();
  const s3Key = `users/${userId}/thumbnails/${objectId}.${ext}`;

  await storage.putObject({
    key: s3Key,
    body: buffer,
    contentType: mimeType,
  });

  await db.insert(thumbnailObjects).values({
    id: objectId,
    userId,
    s3Key,
    sizeBytes,
  });

  return { imageUrl: `${baseUrl}/api/thumbnail/serve/${objectId}`, objectId };
}
