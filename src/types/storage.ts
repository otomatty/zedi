// ストレージ関連の型定義

/**
 * サポートするストレージプロバイダーのタイプ
 */
export type StorageProviderType =
  | "imgur"
  | "cloudflare-r2"
  | "github"
  | "google-drive";

/**
 * ストレージプロバイダーの設定
 */
export interface StorageProviderConfig {
  // Google Drive（OAuth2認証が必要）
  googleDriveClientId?: string;
  googleDriveClientSecret?: string;
  googleDriveAccessToken?: string;
  googleDriveRefreshToken?: string;
  googleDriveFolderId?: string; // 保存先フォルダID（オプション）

  // Imgur（最も簡単：Client IDのみ）
  imgurClientId?: string;

  // Cloudflare R2（S3互換）
  r2Bucket?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Endpoint?: string;
  r2AccountId?: string;
  r2PublicUrl?: string; // 公開URLのベース（カスタムドメインまたはr2.dev）

  // GitHub（Personal Access Token）
  githubRepository?: string; // "owner/repo"形式
  githubToken?: string;
  githubBranch?: string; // デフォルト: "main"
  githubPath?: string; // 保存先ディレクトリ（例: "images"）
}

/**
 * ストレージ設定
 */
export interface StorageSettings {
  provider: StorageProviderType;
  config: StorageProviderConfig;
  isConfigured: boolean;
  name?: string; // ユーザーが設定したストレージの名前（将来の複数ストレージ対応用）
}

/**
 * ストレージプロバイダーの情報
 */
export interface StorageProviderInfo {
  id: StorageProviderType;
  name: string;
  description: string;
  helpUrl: string;
  setupDifficulty: "easy" | "medium" | "hard";
  freeTier: string;
}

/**
 * サポートするストレージプロバイダー一覧
 */
export const STORAGE_PROVIDERS: StorageProviderInfo[] = [
  {
    id: "imgur",
    name: "Imgur",
    description: "Client IDのみで簡単セットアップ",
    helpUrl: "https://api.imgur.com/oauth2/addclient",
    setupDifficulty: "easy",
    freeTier: "無料（匿名アップロード）",
  },
  {
    id: "cloudflare-r2",
    name: "Cloudflare R2",
    description: "S3互換ストレージ、10GB/月無料",
    helpUrl: "https://dash.cloudflare.com/",
    setupDifficulty: "medium",
    freeTier: "10GB/月無料",
  },
  {
    id: "github",
    name: "GitHub",
    description: "GitHubリポジトリに画像を保存",
    helpUrl: "https://github.com/settings/tokens",
    setupDifficulty: "easy",
    freeTier: "無料（パブリックリポジトリ推奨）",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "OAuth2認証でGoogleドライブに保存",
    helpUrl: "https://console.cloud.google.com/",
    setupDifficulty: "hard",
    freeTier: "15GB無料",
  },
];

/**
 * デフォルトのストレージ設定
 */
export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  provider: "imgur",
  config: {},
  isConfigured: false,
};

/**
 * プロバイダーIDから情報を取得
 */
export function getStorageProviderById(
  id: StorageProviderType
): StorageProviderInfo | undefined {
  return STORAGE_PROVIDERS.find((p) => p.id === id);
}
