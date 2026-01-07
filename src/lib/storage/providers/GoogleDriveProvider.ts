// Google Drive ストレージプロバイダー
// OAuth2認証を使用

import {
  StorageProviderInterface,
  UploadOptions,
  ConnectionTestResult,
  generateFileName,
} from "../types";

/**
 * Google Drive API レスポンス
 */
interface GoogleDriveFileResponse {
  id: string;
  name: string;
  webViewLink: string;
  webContentLink?: string;
}

/**
 * Google Drive ストレージプロバイダー
 *
 * 設定方法:
 * 1. Google Cloud Consoleにアクセス
 * 2. 新しいプロジェクトを作成
 * 3. Google Drive APIを有効化
 * 4. OAuth 2.0クライアントIDを作成
 * 5. 承認済みリダイレクトURIを設定
 *
 * 注意: このプロバイダーはOAuth2認証フローが必要です
 */
export class GoogleDriveProvider implements StorageProviderInterface {
  readonly name = "Google Drive";
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string;
  private refreshToken: string;
  private readonly folderId?: string;
  private readonly apiUrl = "https://www.googleapis.com/upload/drive/v3/files";
  private readonly tokenUrl = "https://oauth2.googleapis.com/token";

  constructor(config: {
    clientId: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    folderId?: string;
  }) {
    if (!config.clientId || !config.accessToken) {
      throw new Error("Google Drive configuration is incomplete");
    }
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.folderId = config.folderId;
  }

  /**
   * 画像をGoogle Driveにアップロード
   */
  async uploadImage(file: File, options?: UploadOptions): Promise<string> {
    const fileName = options?.fileName || generateFileName(file);

    // メタデータ
    const metadata: Record<string, unknown> = {
      name: fileName,
      mimeType: file.type,
    };

    // フォルダが指定されている場合
    if (this.folderId || options?.folder) {
      metadata.parents = [this.folderId || options?.folder];
    }

    // マルチパートアップロード
    const boundary = "zedi_upload_boundary";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    // ファイルをArrayBufferに変換
    const fileBuffer = await file.arrayBuffer();

    // マルチパートボディを構築
    const metadataPart =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata);

    const filePart =
      delimiter +
      `Content-Type: ${file.type}\r\n` +
      "Content-Transfer-Encoding: base64\r\n\r\n";

    // Base64エンコード
    const base64 = btoa(
      new Uint8Array(fileBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );

    const requestBody = metadataPart + filePart + base64 + closeDelimiter;

    // アップロードリクエスト
    let response = await fetch(
      `${this.apiUrl}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: requestBody,
      }
    );

    // トークンが期限切れの場合はリフレッシュして再試行
    if (response.status === 401 && this.refreshToken) {
      await this.refreshAccessToken();
      response = await fetch(
        `${this.apiUrl}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: requestBody,
        }
      );
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Google Drive upload failed: ${response.status} ${
          errorData.error?.message || response.statusText
        }`
      );
    }

    const data: GoogleDriveFileResponse = await response.json();

    // ファイルを公開設定にする
    await this.makeFilePublic(data.id);

    // 直接アクセスできるURLを返す
    return `https://drive.google.com/uc?export=view&id=${data.id}`;
  }

  /**
   * ファイルを公開設定にする
   */
  private async makeFilePublic(fileId: string): Promise<void> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;

    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
      }),
    });
  }

  /**
   * アクセストークンをリフレッシュ
   */
  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh access token");
    }

    const data = await response.json();
    this.accessToken = data.access_token;
  }

  /**
   * 画像を削除
   */
  async deleteImage(url: string): Promise<void> {
    // URLからファイルIDを抽出
    const match = url.match(/[?&]id=([^&]+)/);
    if (!match) {
      throw new Error("Invalid Google Drive image URL");
    }
    const fileId = match[1];

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete file: ${response.status}`);
    }
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // ユーザー情報を取得してアクセス確認
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/about?fields=user",
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          // トークンリフレッシュを試みる
          if (this.refreshToken) {
            try {
              await this.refreshAccessToken();
              return {
                success: true,
                message:
                  "Google Driveへの接続に成功しました（トークンを更新しました）",
              };
            } catch {
              throw new Error(
                "認証の更新に失敗しました。再認証が必要です。"
              );
            }
          }
          throw new Error("認証に失敗しました。再認証が必要です。");
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        message: `Google Drive (${data.user?.emailAddress}) への接続に成功しました`,
      };
    } catch (error) {
      return {
        success: false,
        message: "Google Driveへの接続に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * OAuth2認証URLを生成
   */
  static getAuthUrl(clientId: string, redirectUri: string): string {
    const scope = encodeURIComponent(
      "https://www.googleapis.com/auth/drive.file"
    );
    return (
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${scope}&` +
      `access_type=offline&` +
      `prompt=consent`
    );
  }

  /**
   * 認証コードをトークンに交換
   */
  static async exchangeCodeForTokens(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to exchange code for tokens");
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }
}
