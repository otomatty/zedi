import type { CloudflareBindings } from "../../types/cloudflare.js";
import { createR2StorageClient } from "./r2StorageClient.js";
import { S3StorageClient } from "./s3StorageClient.js";
import type { StorageClient } from "./types.js";

/**
 * Whether object storage is configured for the current runtime.
 * 現在のランタイムでオブジェクトストレージが設定済みか。
 */
export function isStorageConfigured(bindings?: Partial<CloudflareBindings>): boolean {
  if (bindings?.STORAGE_BUCKET) return true;
  return Boolean(
    process.env.STORAGE_BUCKET_NAME &&
    process.env.STORAGE_ENDPOINT &&
    process.env.STORAGE_ACCESS_KEY &&
    process.env.STORAGE_SECRET_KEY,
  );
}

/**
 * Creates a storage client: R2 binding on Workers when available, else S3-compatible env.
 * ストレージクライアントを生成（Workers では R2 binding、それ以外は S3 互換 env）。
 */
export function createStorageClient(bindings?: Partial<CloudflareBindings>): StorageClient {
  if (bindings?.STORAGE_BUCKET) {
    return createR2StorageClient(bindings.STORAGE_BUCKET);
  }
  return new S3StorageClient();
}
