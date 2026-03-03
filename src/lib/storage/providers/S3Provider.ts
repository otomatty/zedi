/**
 * Zedi (S3) ストレージプロバイダー
 * ログイン済みユーザーが画像を Zedi の S3 にアップロード。API: POST /api/media/upload → PUT → POST /api/media/confirm
 */

import { StorageProviderInterface, UploadOptions, ConnectionTestResult } from "../types";

export interface S3ProviderContext {
  getToken: () => Promise<string | null>;
  baseUrl?: string;
}

function getDefaultBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string) ?? "";
}

/**
 * 画像 URL を返す（GET /api/media/:id にすると 302 で署名付き S3 URL へリダイレクト）
 */
function buildImageUrl(baseUrl: string, mediaId: string): string {
  const base =
    baseUrl.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/api/media/${mediaId}`;
}

export class S3Provider implements StorageProviderInterface {
  readonly name = "デフォルトストレージ";
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
    const { uploadUrl, mediaId, s3Key } = await this.requestUploadUrl(file);
    await this.putToS3(uploadUrl, file);
    if (options?.onProgress) {
      options.onProgress({ loaded: file.size, total: file.size, percentage: 100 });
    }
    await this.confirmUpload(mediaId, s3Key, file);
    return buildImageUrl(this.baseUrl, mediaId);
  }

  private async requestUploadUrl(
    file: File,
  ): Promise<{ uploadUrl: string; mediaId: string; s3Key: string }> {
    const base =
      this.baseUrl.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const uploadRes = await fetch(`${base}/api/media/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        content_type: file.type || "application/octet-stream",
        file_name: file.name || undefined,
      }),
    });
    if (uploadRes.status === 401) {
      throw new Error(
        "ログインしていません。デフォルトストレージを使うにはサインインしてください。",
      );
    }
    if (!uploadRes.ok) {
      const err = await uploadRes.text().catch(() => "");
      throw new Error(
        uploadRes.status === 503
          ? "メディアアップロードは現在利用できません"
          : `アップロード準備に失敗しました: ${err || uploadRes.status}`,
      );
    }
    interface UploadPayload {
      upload_url: string;
      media_id: string;
      s3_key: string;
    }
    const raw = (await uploadRes.json()) as { data?: UploadPayload } | UploadPayload;
    const data: UploadPayload =
      raw && typeof raw === "object" && "data" in raw && raw.data
        ? raw.data
        : (raw as UploadPayload);
    if (!data.upload_url || !data.media_id || !data.s3_key) {
      throw new Error("アップロード情報の取得に失敗しました");
    }
    return {
      uploadUrl: data.upload_url,
      mediaId: data.media_id,
      s3Key: data.s3_key,
    };
  }

  private async putToS3(uploadUrl: string, file: File): Promise<void> {
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
  }

  private async confirmUpload(mediaId: string, s3Key: string, file: File): Promise<void> {
    const base =
      this.baseUrl.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const confirmRes = await fetch(`${base}/api/media/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
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
  }

  /**
   * デフォルトストレージ上の画像を削除（/api/media/:id または /api/thumbnail/serve/:id）
   * 自分の画像のみ削除可能（API側で所有者チェック）
   * クロスオリジン対策: baseUrl 由来の origin のみ使用
   */
  async deleteImage(url: string): Promise<void> {
    const base =
      this.baseUrl.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!base) {
      throw new Error("API base URL is not configured");
    }

    const baseOrigin = new URL(base).origin;
    const parsed = new URL(url, baseOrigin);
    if (parsed.origin !== baseOrigin) {
      throw new Error("異なるオリジンのURLは削除できません");
    }

    // /api/media/:id 形式
    const mediaMatch = parsed.pathname.match(/^\/api\/media\/([^/?#]+)$/);
    if (mediaMatch) {
      const mediaId = mediaMatch[1];
      const res = await fetch(`${baseOrigin}/api/media/${mediaId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(
          res.status === 403
            ? "自分の画像のみ削除できます"
            : res.status === 404
              ? "画像が見つかりません"
              : (err as { message?: string }).message || `削除に失敗しました: ${res.status}`,
        );
      }
      return;
    }

    // /api/thumbnail/serve/:id 形式
    const thumbMatch = parsed.pathname.match(/^\/api\/thumbnail\/serve\/([^/?#]+)$/);
    if (thumbMatch) {
      const objectId = thumbMatch[1];
      const res = await fetch(`${baseOrigin}/api/thumbnail/serve/${objectId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(
          res.status === 404
            ? "画像が見つかりません"
            : (err as { message?: string }).message || `削除に失敗しました: ${res.status}`,
        );
      }
      return;
    }

    throw new Error(
      "このURLは削除対象ではありません（/api/media/ または /api/thumbnail/serve/ の画像のみ）",
    );
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // 最小のテスト画像でアップロードを試行
      const testImage = this.createTestImage();
      await this.uploadImage(testImage);
      return {
        success: true,
        message: "デフォルトストレージに接続できました。テスト画像をアップロードしました。",
      };
    } catch (error) {
      return {
        success: false,
        message: "デフォルトストレージへの接続に失敗しました",
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
