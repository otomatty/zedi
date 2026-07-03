import type { StorageClient, StorageGetObjectResult, StorageHeadObjectResult } from "./types.js";
import { S3StorageClient } from "./s3StorageClient.js";

/**
 * Parses an HTTP `Range: bytes=...` header into Cloudflare R2's `R2Range` shape.
 * HTTP Range ヘッダを R2 の `R2Range` に変換する。
 */
export function parseHttpRangeToR2Range(rangeHeader: string): R2Range | undefined {
  const trimmed = rangeHeader.trim();
  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
  if (!match) return undefined;

  const [, startStr, endStr] = match;

  if (startStr === "" && endStr !== "") {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return undefined;
    return { suffix };
  }

  if (startStr !== "") {
    const offset = Number(startStr);
    if (!Number.isFinite(offset) || offset < 0) return undefined;

    if (endStr === "") {
      return { offset };
    }

    const end = Number(endStr);
    if (!Number.isFinite(end) || end < offset) return undefined;
    return { offset, length: end - offset + 1 };
  }

  return undefined;
}

/**
 * R2 binding adapter: server-side ops use the binding; presigned URLs use the S3 API.
 * R2 バインディングアダプタ: サーバ側操作は binding、presigned URL は S3 API。
 */
export class R2StorageClient implements StorageClient {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly presignClient: StorageClient,
  ) {}

  async putObject(params: {
    key: string;
    body: Uint8Array | Buffer;
    contentType?: string;
  }): Promise<void> {
    await this.bucket.put(params.key, params.body, {
      httpMetadata: params.contentType ? { contentType: params.contentType } : undefined,
    });
  }

  async getObject(params: { key: string; range?: string }): Promise<StorageGetObjectResult> {
    const r2Range = params.range ? parseHttpRangeToR2Range(params.range) : undefined;
    if (params.range && !r2Range) {
      throw Object.assign(new Error("Invalid range"), { name: "InvalidRange" });
    }
    const object = await this.bucket.get(params.key, {
      ...(r2Range ? { range: r2Range } : {}),
    });
    if (!object) {
      throw Object.assign(new Error("Object not found"), { name: "NoSuchKey" });
    }
    const body = object.body;
    if (!body) {
      throw new Error("Object not found");
    }
    let contentRange: string | undefined;
    const range = object.range;
    if (range && "offset" in range && range.offset !== undefined && range.length !== undefined) {
      contentRange = `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`;
    }
    return {
      body,
      contentType: object.httpMetadata?.contentType,
      contentLength: object.size,
      contentRange,
    };
  }

  async headObject(params: { key: string }): Promise<StorageHeadObjectResult> {
    const head = await this.bucket.head(params.key);
    if (!head) {
      throw Object.assign(new Error("Object not found"), { name: "NotFound" });
    }
    return {
      contentLength: head.size,
      contentType: head.httpMetadata?.contentType,
    };
  }

  async deleteObject(params: { key: string }): Promise<void> {
    await this.bucket.delete(params.key);
  }

  async getSignedPutUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return this.presignClient.getSignedPutUrl(params);
  }
}

/** Creates an R2 binding client with S3 presign fallback. / R2 binding + S3 presign フォールバック。 */
export function createR2StorageClient(bucket: R2Bucket): StorageClient {
  return new R2StorageClient(bucket, new S3StorageClient());
}
