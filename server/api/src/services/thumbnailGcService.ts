/**
 * サムネイル GC サービス。`thumbnail_objects` の DB 行と S3 オブジェクトの
 * 双方を所有者スコープで削除するための共通ヘルパー。
 *
 * Thumbnail garbage-collection helper. Deletes the `thumbnail_objects` row
 * and the corresponding S3 object under an owner-scoped predicate so callers
 * (DELETE /api/thumbnail/serve/:id, DELETE /api/pages/:id) share the same
 * TOCTOU-safe semantics.
 *
 * 設計: DB 削除を先に行い、所有者一致の WHERE で 1 行消えた場合だけ S3 を消す。
 *  - 並行削除や所有権変更で 0 行になった場合は no-op
 *  - DB 行は無いが S3 オブジェクトだけ残った（"DB先消し" の途中失敗）場合は
 *    オペレーションログから手動 / 別途 GC で回収する。逆方向（S3 先消し）の
 *    オーファンは UI が画像 404 になるため避ける。
 *
 * Strategy: DELETE the DB row first under an ownership-scoped WHERE, and
 * only call S3 if that row count is non-zero. A concurrent delete or
 * ownership change collapses to a no-op. If the S3 call later fails we log
 * the orphan and rely on a sweeper to reclaim it — losing the DB row first
 * is safer than the inverse (DB row pointing at a missing blob would surface
 * as broken images in the UI).
 */
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { thumbnailObjects } from "../schema/index.js";
import { getEnv } from "../lib/env.js";
import type { Database } from "../types/index.js";

// S3 クライアントとバケット名は遅延初期化する。`serve.ts` と違い、このサービス
// は `pages.ts` から import される。`pages.ts` のテスト（routes/pages.test.ts）
// などで STORAGE_* を未設定のまま実行されるケースがあり、モジュール直下で
// `getEnv` を呼ぶと無関係なテストまで道連れに落ちてしまう。最初の GC 呼び出し
// 時にだけ必須環境変数を要求し、テスト環境では env を仕込まずに pages の他
// ロジックを検証できるようにする。
//
// Lazy-init the S3 client and bucket name. Unlike `serve.ts`, this module is
// imported by `pages.ts`, which has tests that don't set STORAGE_* (the pages
// route doesn't need storage for most cases). Calling `getEnv` at module
// top-level would crash those unrelated tests on import; deferring the lookup
// keeps the dependency local to actual GC calls.
let s3: S3Client | undefined;
let bucket: string | undefined;

function getS3(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      endpoint: getEnv("STORAGE_ENDPOINT"),
      region: "auto",
      credentials: {
        accessKeyId: getEnv("STORAGE_ACCESS_KEY"),
        secretAccessKey: getEnv("STORAGE_SECRET_KEY"),
      },
      forcePathStyle: true,
    });
  }
  return s3;
}

function getBucket(): string {
  if (!bucket) bucket = getEnv("STORAGE_BUCKET_NAME");
  return bucket;
}

/**
 * 指定 thumbnail_objects 行を所有者スコープで削除する。
 * 行が見つからなかった (= 既に削除済 or 別ユーザー) 場合は何もしない。
 *
 * Deletes a `thumbnail_objects` row scoped to its owner, then deletes the
 * matching S3 object. No-op when the row is missing (already deleted or
 * owned by someone else). Errors during S3 delete are logged so a sweeper
 * can reclaim orphaned blobs but never propagated — callers must not block
 * page deletion on storage availability.
 *
 * @param objectId - 対象の thumbnail_objects.id
 * @param userId - 呼び出し元ユーザー ID（所有者一致を必須）
 * @param db - Drizzle DB クライアント
 */
export async function deleteThumbnailObject(
  objectId: string,
  userId: string,
  db: Database,
): Promise<void> {
  const deleted = await db
    .delete(thumbnailObjects)
    .where(and(eq(thumbnailObjects.id, objectId), eq(thumbnailObjects.userId, userId)))
    .returning({ s3Key: thumbnailObjects.s3Key });

  const deletedRow = deleted[0];
  if (!deletedRow) return;

  try {
    await getS3().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: deletedRow.s3Key }));
  } catch (err) {
    const s3Err = err as { name?: string } | null;
    if (s3Err?.name !== "NoSuchKey") {
      console.error("[thumbnail/gc] S3 DeleteObject failed after DB delete (orphaned object):", {
        objectId,
        s3Key: deletedRow.s3Key,
        err,
      });
    }
  }
}
