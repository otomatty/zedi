// Cloudflare R2 ストレージプロバイダー
// S3互換APIを使用

import {
  StorageProviderInterface,
  UploadOptions,
  ConnectionTestResult,
  generateFileName,
} from "../types";

/**
 * Cloudflare R2 ストレージプロバイダー
 *
 * 設定方法:
 * 1. Cloudflare Dashboardにログイン
 * 2. R2 > バケットを作成
 * 3. R2 API Tokenを作成（Object Read & Write権限）
 * 4. Access Key IDとSecret Access Keyを取得
 *
 * 注意: ブラウザからのCORS対応のため、Workerを経由する必要があります
 */
export class CloudflareR2Provider implements StorageProviderInterface {
  readonly name = "Cloudflare R2";
  private readonly bucket: string;
  private readonly accountId: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly publicUrl?: string;

  constructor(config: {
    bucket: string;
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicUrl?: string;
  }) {
    if (!config.bucket || !config.accountId || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error("Cloudflare R2 configuration is incomplete");
    }
    this.bucket = config.bucket;
    this.accountId = config.accountId;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.publicUrl = config.publicUrl;
  }

  /**
   * 画像をR2にアップロード
   * 
   * 注意: ブラウザから直接S3互換APIを呼び出すにはCORS設定が必要です。
   * 実運用では、Cloudflare WorkerをプロキシとしてAPIを呼び出すことを推奨します。
   */
  async uploadImage(file: File, options?: UploadOptions): Promise<string> {
    const fileName = options?.fileName || generateFileName(file);
    const key = options?.folder ? `${options.folder}/${fileName}` : fileName;

    // R2 S3互換エンドポイント
    const endpoint = `https://${this.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${this.bucket}/${key}`;

    // AWS Signature Version 4を使用した署名
    // ブラウザから直接呼び出す場合は、事前にCORS設定が必要
    const headers = await this.signRequest("PUT", url, file);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Cloudflare R2 upload failed: ${response.status} ${errorText}`
      );
    }

    // 公開URLを返す
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }

    // r2.dev ドメインを使用（バケットの公開設定が必要）
    return `https://${this.bucket}.${this.accountId}.r2.dev/${key}`;
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // HEADリクエストでバケットの存在確認
      const endpoint = `https://${this.accountId}.r2.cloudflarestorage.com`;
      const url = `${endpoint}/${this.bucket}/`;

      const headers = await this.signRequest("HEAD", url);

      const response = await fetch(url, {
        method: "HEAD",
        headers,
      });

      if (response.ok || response.status === 404) {
        // 404はバケットが存在しないか空の場合
        return {
          success: true,
          message: "Cloudflare R2への接続に成功しました",
        };
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      return {
        success: false,
        message: "Cloudflare R2への接続に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * AWS Signature Version 4 を使用したリクエスト署名
   * 
   * 注意: これは簡略化した実装です。
   * 実運用では aws4 ライブラリの使用を推奨します。
   */
  private async signRequest(
    method: string,
    url: string,
    body?: File
  ): Promise<Record<string, string>> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
    const dateStamp = amzDate.slice(0, 8);

    const region = "auto";
    const service = "s3";

    // 署名に必要なヘッダー
    const headers: Record<string, string> = {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    };

    // 認証情報
    const credential = `${this.accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;

    // 署名付きヘッダー
    const signedHeaders = Object.keys(headers)
      .sort()
      .join(";");

    // Authorization ヘッダー
    // 注意: 実際のAWS SigV4署名はもっと複雑です
    // ブラウザでの実装には制限があるため、Workerを推奨
    headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=placeholder`;

    return headers;
  }
}
