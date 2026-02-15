/**
 * Zedi (S3) ストレージプロバイダー
 * ログイン済みユーザーが画像を Zedi の S3 にアップロード。API: POST /api/media/upload → PUT → POST /api/media/confirm
 */

import {
  StorageProviderInterface,
  UploadOptions,
  ConnectionTestResult,
} from "../types";

export interface S3ProviderContext {
  getToken: () => Promise<string | null>;
  baseUrl?: string;
}

function getDefaultBaseUrl(): string {
  return (import.meta.env.VITE_ZEDI_API_BASE_URL as string) ?? "";
}

/**
 * 画像 URL を返す（GET /api/media/:id にすると 302 で署名付き S3 URL へリダイレクト）
 */
function buildImageUrl(baseUrl: string, mediaId: string): string {
  const base = baseUrl.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/api/media/${mediaId}`;
}

export class S3Provider implements StorageProviderInterface {
  readonly name = "Zedi (S3)";
  private readonly getToken: () => Promise<string | null>;
  private readonly baseUrl: string;

  constructor(_config: Record<string, unknown>, context: S3ProviderContext) {
    if (!context.getToken) {
      throw new Error("S3Provider requires getToken in context");
    }
    this.getToken = context.getToken;
    this.baseUrl = context.baseUrl ?? getDefaultBaseUrl();
  }

  async uploadImage(file: File, options?: UploadOptions): Promise<string> {
    const token = await this.getToken();
    if (!token) {
      throw new Error("ログインしていません。Zedi (S3) を使うにはサインインしてください。");
    }

    const base = this.baseUrl.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // 1) Presigned URL 取得
    const uploadRes = await fetch(`${base}/api/media/upload`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content_type: file.type || "application/octet-stream",
        file_name: file.name || undefined,
      }),
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text().catch(() => "");
      throw new Error(uploadRes.status === 503 ? "メディアアップロードは現在利用できません" : `アップロード準備に失敗しました: ${err || uploadRes.status}`);
    }
    interface UploadPayload {
      upload_url: string;
      media_id: string;
      s3_key: string;
    }
    const raw = await uploadRes.json() as { data?: UploadPayload } | UploadPayload;
    const data: UploadPayload = (raw && typeof raw === "object" && "data" in raw && raw.data)
      ? raw.data
      : (raw as UploadPayload);
    const uploadUrl = data.upload_url;
    const mediaId = data.media_id;
    const s3Key = data.s3_key;
    if (!uploadUrl || !mediaId || !s3Key) {
      throw new Error("アップロード情報の取得に失敗しました");
    }

    // 2) S3 に PUT（Presigned URL は別オリジンなので CORS 許可が必要）
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
    });
    if (!putRes.ok) {
      throw new Error(`アップロードに失敗しました: ${putRes.status}`);
    }

    // 進捗コールバック（PUT 完了時）
    if (options?.onProgress) {
      options.onProgress({ loaded: file.size, total: file.size, percentage: 100 });
    }

    // 3) 完了通知
    const confirmRes = await fetch(`${base}/api/media/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        media_id: mediaId,
        s3_key: s3Key,
        file_name: file.name || null,
        content_type: file.type || null,
        file_size: file.size,
      }),
    });
    if (!confirmRes.ok) {
      const err = await confirmRes.text().catch(() => "");
      throw new Error(`アップロードの登録に失敗しました: ${err || confirmRes.status}`);
    }

    return buildImageUrl(this.baseUrl, mediaId);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const token = await this.getToken();
      if (!token) {
        return {
          success: false,
          message: "ログインしていません。Zedi (S3) を使うにはサインインしてください。",
          error: "Not authenticated",
        };
      }
      // 最小のテスト画像でアップロードを試行
      const testImage = this.createTestImage();
      await this.uploadImage(testImage);
      return {
        success: true,
        message: "Zedi (S3) に接続できました。テスト画像をアップロードしました。",
      };
    } catch (error) {
      return {
        success: false,
        message: "Zedi (S3) への接続に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private createTestImage(): File {
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new File([array], "test.png", { type: "image/png" });
  }
}
