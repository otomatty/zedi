// ストレージプロバイダーのファクトリー

import { StorageSettings, StorageProviderType } from "@/types/storage";
import { StorageProviderInterface } from "./types";
import { GyazoProvider } from "./providers/GyazoProvider";
import { GitHubProvider } from "./providers/GitHubProvider";
import { GoogleDriveProvider } from "./providers/GoogleDriveProvider";
import { S3Provider, type S3ProviderContext } from "./providers/S3Provider";

/**
 * S3 プロバイダー用のコンテキスト（getToken 必須。baseUrl は省略時は VITE_API_BASE_URL）
 */
export type StorageProviderContext = S3ProviderContext;

/**
 * ストレージ設定からプロバイダーインスタンスを取得
 * provider が "s3" のときは context.getToken が必須
 */
export function getStorageProvider(
  settings: StorageSettings,
  context?: StorageProviderContext,
): StorageProviderInterface {
  const { provider, config } = settings;

  // Legacy: cloudflare-r2 is no longer supported; use default storage
  const effectiveProvider = provider === "cloudflare-r2" ? "s3" : (provider as StorageProviderType);

  switch (effectiveProvider) {
    case "s3":
      if (!context?.getToken) {
        throw new Error(
          "デフォルトストレージを使うには getToken が必要です（ログインしてください）",
        );
      }
      return new S3Provider(config as Record<string, unknown>, {
        getToken: context.getToken,
        baseUrl: context.baseUrl,
      });

    case "gyazo":
      if (!config.gyazoAccessToken) {
        throw new Error("Gyazo Access Token が設定されていません");
      }
      return new GyazoProvider(config.gyazoAccessToken);

    case "github":
      if (!config.githubRepository || !config.githubToken) {
        throw new Error("GitHub の設定が不完全です");
      }
      return new GitHubProvider({
        repository: config.githubRepository,
        token: config.githubToken,
        branch: config.githubBranch,
        path: config.githubPath,
      });

    case "google-drive":
      if (!config.googleDriveClientId || !config.googleDriveAccessToken) {
        throw new Error("Google Drive の設定が不完全です");
      }
      return new GoogleDriveProvider({
        clientId: config.googleDriveClientId,
        clientSecret: config.googleDriveClientSecret || "",
        accessToken: config.googleDriveAccessToken,
        refreshToken: config.googleDriveRefreshToken || "",
        folderId: config.googleDriveFolderId,
      });

    default:
      throw new Error(`Unknown storage provider: ${provider}`);
  }
}

/**
 * プロバイダーが設定されているかを確認
 */
export function isProviderConfigured(
  provider: StorageProviderType,
  config: StorageSettings["config"],
): boolean {
  switch (provider) {
    case "gyazo":
      return !!config.gyazoAccessToken;

    case "github":
      return !!(config.githubRepository && config.githubToken);

    case "google-drive":
      return !!(config.googleDriveClientId && config.googleDriveAccessToken);

    case "s3":
      return true;

    default:
      return false;
  }
}

/**
 * アップロード時に使う実効的な設定を返す
 * preferDefaultStorage が true のときはデフォルトストレージ(s3)用の設定を返す
 */
export function getSettingsForUpload(settings: StorageSettings): StorageSettings {
  if (settings.preferDefaultStorage !== false) {
    return {
      ...settings,
      provider: "s3",
      config: {},
      isConfigured: true,
    };
  }
  return settings;
}

/**
 * アップロード可能かどうか（設定が有効か）
 * デフォルトストレージ優先のときは true、外部のときはそのプロバイダーが設定済みなら true
 */
export function isStorageConfiguredForUpload(settings: StorageSettings): boolean {
  if (settings.preferDefaultStorage !== false) return true;
  return settings.provider !== "s3" && isProviderConfigured(settings.provider, settings.config);
}

// Re-export types and utilities
export * from "./types";
export { convertToWebP } from "./convertToWebP";
export { GyazoProvider } from "./providers/GyazoProvider";
export { GitHubProvider } from "./providers/GitHubProvider";
export { GoogleDriveProvider } from "./providers/GoogleDriveProvider";
export { S3Provider } from "./providers/S3Provider";
