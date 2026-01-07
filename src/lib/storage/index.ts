// ストレージプロバイダーのファクトリー

import { StorageSettings, StorageProviderType } from "@/types/storage";
import { StorageProviderInterface } from "./types";
import { ImgurProvider } from "./providers/ImgurProvider";
import { CloudflareR2Provider } from "./providers/CloudflareR2Provider";
import { GitHubProvider } from "./providers/GitHubProvider";
import { GoogleDriveProvider } from "./providers/GoogleDriveProvider";

/**
 * ストレージ設定からプロバイダーインスタンスを取得
 */
export function getStorageProvider(
  settings: StorageSettings
): StorageProviderInterface {
  const { provider, config } = settings;

  switch (provider) {
    case "imgur":
      if (!config.imgurClientId) {
        throw new Error("Imgur Client ID が設定されていません");
      }
      return new ImgurProvider(config.imgurClientId);

    case "cloudflare-r2":
      if (
        !config.r2Bucket ||
        !config.r2AccountId ||
        !config.r2AccessKeyId ||
        !config.r2SecretAccessKey
      ) {
        throw new Error("Cloudflare R2 の設定が不完全です");
      }
      return new CloudflareR2Provider({
        bucket: config.r2Bucket,
        accountId: config.r2AccountId,
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
        publicUrl: config.r2PublicUrl,
      });

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
      if (
        !config.googleDriveClientId ||
        !config.googleDriveAccessToken
      ) {
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
  config: StorageSettings["config"]
): boolean {
  switch (provider) {
    case "imgur":
      return !!config.imgurClientId;

    case "cloudflare-r2":
      return !!(
        config.r2Bucket &&
        config.r2AccountId &&
        config.r2AccessKeyId &&
        config.r2SecretAccessKey
      );

    case "github":
      return !!(config.githubRepository && config.githubToken);

    case "google-drive":
      return !!(
        config.googleDriveClientId &&
        config.googleDriveAccessToken
      );

    default:
      return false;
  }
}

// Re-export types
export * from "./types";
export { ImgurProvider } from "./providers/ImgurProvider";
export { CloudflareR2Provider } from "./providers/CloudflareR2Provider";
export { GitHubProvider } from "./providers/GitHubProvider";
export { GoogleDriveProvider } from "./providers/GoogleDriveProvider";
