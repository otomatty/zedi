// GitHub ストレージプロバイダー
// GitHub Contents APIを使用してリポジトリに画像を保存

import {
  StorageProviderInterface,
  UploadOptions,
  ConnectionTestResult,
  generateFileName,
  fileToBase64,
} from "../types";

/**
 * GitHub API レスポンス
 */
interface GitHubContentResponse {
  content: {
    sha: string;
    download_url: string;
    html_url: string;
  };
}

/**
 * GitHub ストレージプロバイダー
 *
 * 設定方法:
 * 1. https://github.com/settings/tokens にアクセス
 * 2. "Generate new token (classic)" をクリック
 * 3. "repo" スコープにチェック
 * 4. トークンをコピー
 * 5. 画像保存用のリポジトリを作成（パブリック推奨）
 */
export class GitHubProvider implements StorageProviderInterface {
  readonly name = "GitHub";
  private readonly repository: string; // "owner/repo" 形式
  private readonly token: string;
  private readonly branch: string;
  private readonly path: string;
  private readonly apiUrl = "https://api.github.com";

  constructor(config: {
    repository: string;
    token: string;
    branch?: string;
    path?: string;
  }) {
    if (!config.repository || !config.token) {
      throw new Error("GitHub configuration is incomplete");
    }
    this.repository = config.repository;
    this.token = config.token;
    this.branch = config.branch || "main";
    this.path = config.path || "images";
  }

  /**
   * 画像をGitHubリポジトリにアップロード
   */
  async uploadImage(file: File, options?: UploadOptions): Promise<string> {
    const fileName = options?.fileName || generateFileName(file);
    const folder = options?.folder || this.path;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    // ファイルをBase64に変換
    const content = await fileToBase64(file);

    // GitHub Contents API
    const url = `${this.apiUrl}/repos/${this.repository}/contents/${filePath}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Upload image: ${fileName}`,
        content: content,
        branch: this.branch,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `GitHub upload failed: ${response.status} ${
          errorData.message || response.statusText
        }`
      );
    }

    const data: GitHubContentResponse = await response.json();

    // raw.githubusercontent.com の直接リンクを返す
    const [owner, repo] = this.repository.split("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/${this.branch}/${filePath}`;
  }

  /**
   * 画像を削除
   */
  async deleteImage(url: string): Promise<void> {
    // URLからファイルパスを抽出
    const match = url.match(
      /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/
    );
    if (!match) {
      throw new Error("Invalid GitHub image URL");
    }
    const filePath = match[1];

    // まず現在のファイルのSHAを取得
    const getUrl = `${this.apiUrl}/repos/${this.repository}/contents/${filePath}?ref=${this.branch}`;
    const getResponse = await fetch(getUrl, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!getResponse.ok) {
      throw new Error(`Failed to get file info: ${getResponse.status}`);
    }

    const fileInfo = await getResponse.json();

    // ファイルを削除
    const deleteUrl = `${this.apiUrl}/repos/${this.repository}/contents/${filePath}`;
    const deleteResponse = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Delete image: ${filePath}`,
        sha: fileInfo.sha,
        branch: this.branch,
      }),
    });

    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete file: ${deleteResponse.status}`);
    }
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // リポジトリ情報を取得してアクセス確認
      const url = `${this.apiUrl}/repos/${this.repository}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("認証に失敗しました。トークンを確認してください。");
        }
        if (response.status === 404) {
          throw new Error(
            "リポジトリが見つかりません。リポジトリ名を確認してください。"
          );
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const repoData = await response.json();

      // 書き込み権限があるか確認
      if (!repoData.permissions?.push) {
        return {
          success: false,
          message: "書き込み権限がありません",
          error:
            "トークンにrepoスコープがあることを確認してください",
        };
      }

      return {
        success: true,
        message: `GitHubリポジトリ "${this.repository}" への接続に成功しました`,
      };
    } catch (error) {
      return {
        success: false,
        message: "GitHubへの接続に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
