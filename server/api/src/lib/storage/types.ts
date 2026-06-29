/**
 * Object storage abstraction for S3-compatible backends and Cloudflare R2 bindings.
 * オブジェクトストレージ抽象（S3 互換 API / R2 バインディング）。
 */

/** Result of a storage GET (full or ranged). / GET（全体または Range）の結果。 */
export interface StorageGetObjectResult {
  body: ReadableStream | NodeJS.ReadableStream;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
}

/** Result of HEAD. / HEAD の結果。 */
export interface StorageHeadObjectResult {
  contentLength?: number;
  contentType?: string;
}

/**
 * Storage operations used by media, thumbnails, and commit flows.
 * メディア・サムネ・commit フローで使うストレージ操作。
 */
export interface StorageClient {
  /** Upload an object. / オブジェクトをアップロード。 */
  putObject(params: {
    key: string;
    body: Uint8Array | Buffer;
    contentType?: string;
  }): Promise<void>;

  /** Download an object (optional HTTP Range). / オブジェクト取得（Range 任意）。 */
  getObject(params: { key: string; range?: string }): Promise<StorageGetObjectResult>;

  /** Metadata without body. / ボディなしのメタデータ取得。 */
  headObject(params: { key: string }): Promise<StorageHeadObjectResult>;

  /** Delete an object. / オブジェクト削除。 */
  deleteObject(params: { key: string }): Promise<void>;

  /** Presigned PUT URL for direct client upload. / クライアント直接アップロード用 presigned PUT URL。 */
  getSignedPutUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
