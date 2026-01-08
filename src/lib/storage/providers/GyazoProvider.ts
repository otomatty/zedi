// Gyazo ストレージプロバイダー
// Access Tokenで動作するシンプルなプロバイダー

import {
  StorageProviderInterface,
  UploadOptions,
  ConnectionTestResult,
} from "../types";

/**
 * Gyazo API レスポンス
 */
interface GyazoResponse {
  image_id: string;
  permalink_url: string;
  thumb_url: string;
  url: string;
  type: string;
}

/**
 * Gyazo ストレージプロバイダー
 *
 * 設定方法:
 * 1. https://gyazo.com/oauth/applications にアクセス
 * 2. "New Application" をクリック
 * 3. アプリケーション情報を入力して作成
 * 4. "Your access token" の "Generate" をクリック
 * 5. Access Token をコピー
 */
export class GyazoProvider implements StorageProviderInterface {
  readonly name = "Gyazo";
  private readonly accessToken: string;
  private readonly uploadUrl = "https://upload.gyazo.com/api/upload";

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new Error("Gyazo Access Token is required");
    }
    this.accessToken = accessToken;
  }

  /**
   * 画像をGyazoにアップロード
   */
  async uploadImage(file: File, _options?: UploadOptions): Promise<string> {
    // FormDataを作成
    const formData = new FormData();
    formData.append("imagedata", file);
    formData.append("access_token", this.accessToken);

    // アップロードリクエスト
    const response = await fetch(this.uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Gyazo upload failed: ${response.status} ${errorText}`
      );
    }

    const data: GyazoResponse = await response.json();

    if (!data.url) {
      throw new Error("Gyazo upload failed: No URL returned");
    }

    return data.url;
  }

  /**
   * 接続テスト
   * 小さなテスト画像をアップロードして確認
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // 1x1の透明PNGを作成してテスト
      const testImage = this.createTestImage();
      const url = await this.uploadImage(testImage);

      return {
        success: true,
        message: `接続成功: テスト画像がアップロードされました`,
      };
    } catch (error) {
      return {
        success: false,
        message: "Gyazoへの接続に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * テスト用の1x1透明PNG画像を作成
   */
  private createTestImage(): File {
    // 1x1 transparent PNG base64
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
