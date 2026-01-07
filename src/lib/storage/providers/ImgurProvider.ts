// Imgur ストレージプロバイダー
// Client IDのみで動作する最もシンプルなプロバイダー

import {
  StorageProviderInterface,
  UploadOptions,
  ConnectionTestResult,
} from "../types";

/**
 * Imgur API レスポンス
 */
interface ImgurResponse {
  success: boolean;
  status: number;
  data: {
    id: string;
    link: string;
    deletehash?: string;
    type: string;
    width: number;
    height: number;
  };
}

/**
 * Imgur ストレージプロバイダー
 *
 * 設定方法:
 * 1. https://api.imgur.com/oauth2/addclient にアクセス
 * 2. "Anonymous usage without user authorization" を選択
 * 3. Client ID をコピー
 */
export class ImgurProvider implements StorageProviderInterface {
  readonly name = "Imgur";
  private readonly clientId: string;
  private readonly apiUrl = "https://api.imgur.com/3/image";

  constructor(clientId: string) {
    if (!clientId) {
      throw new Error("Imgur Client ID is required");
    }
    this.clientId = clientId;
  }

  /**
   * 画像をImgurにアップロード
   */
  async uploadImage(file: File, options?: UploadOptions): Promise<string> {
    // ファイルをBase64に変換
    const base64 = await this.fileToBase64(file);

    // FormDataを作成
    const formData = new FormData();
    formData.append("image", base64);
    formData.append("type", "base64");

    if (options?.fileName) {
      formData.append("name", options.fileName);
    }

    // アップロードリクエスト
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Client-ID ${this.clientId}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Imgur upload failed: ${response.status} ${
          errorData.data?.error || response.statusText
        }`
      );
    }

    const data: ImgurResponse = await response.json();

    if (!data.success) {
      throw new Error("Imgur upload failed: Unknown error");
    }

    return data.data.link;
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
        message: `接続成功: テスト画像がアップロードされました (${url})`,
      };
    } catch (error) {
      return {
        success: false,
        message: "Imgurへの接続に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * ファイルをBase64に変換
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Data URLからBase64部分のみを抽出
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
