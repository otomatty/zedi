import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "../env.js";
import type { StorageClient, StorageGetObjectResult, StorageHeadObjectResult } from "./types.js";

let _client: S3Client | null = null;
let _bucketName: string | null = null;

/**
 * Returns a lazily initialized S3-compatible client from `STORAGE_*` env vars.
 * `STORAGE_*` 環境変数から S3 互換クライアントを遅延初期化して返す。
 */
export function getS3Client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: getEnv("STORAGE_ENDPOINT"),
      region: "auto",
      credentials: {
        accessKeyId: getEnv("STORAGE_ACCESS_KEY"),
        secretAccessKey: getEnv("STORAGE_SECRET_KEY"),
      },
      forcePathStyle: true,
    });
  }
  return _client;
}

/** Resets cached client (tests only). / キャッシュクライアントをリセット（テスト用）。 */
export function resetS3ClientCacheForTests(): void {
  _client = null;
  _bucketName = null;
}

function getBucketName(): string {
  if (!_bucketName) _bucketName = getEnv("STORAGE_BUCKET_NAME");
  return _bucketName;
}

/**
 * S3-compatible storage client (MinIO / Wasabi / Cloudflare R2 S3 API).
 * S3 互換ストレージクライアント。
 */
export class S3StorageClient implements StorageClient {
  async putObject(params: {
    key: string;
    body: Uint8Array | Buffer;
    contentType?: string;
  }): Promise<void> {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async getObject(params: { key: string; range?: string }): Promise<StorageGetObjectResult> {
    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: params.key,
        ...(params.range ? { Range: params.range } : {}),
      }),
    );
    const body = response.Body;
    if (!body) {
      throw new Error("Object not found");
    }
    return {
      body: body as NodeJS.ReadableStream,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      contentRange: response.ContentRange,
    };
  }

  async headObject(params: { key: string }): Promise<StorageHeadObjectResult> {
    const head = await getS3Client().send(
      new HeadObjectCommand({ Bucket: getBucketName(), Key: params.key }),
    );
    return {
      contentLength: head.ContentLength,
      contentType: head.ContentType,
    };
  }

  async deleteObject(params: { key: string }): Promise<void> {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: params.key }));
  }

  async getSignedPutUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: params.key,
        ContentType: params.contentType,
      }),
      { expiresIn: params.expiresInSeconds },
    );
  }
}
