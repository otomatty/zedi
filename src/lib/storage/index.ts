// ストレージプロバイダーのファクトリー

import { StorageSettings, StorageProviderType } from "@/types/storage";
import { StorageProviderInterface } from "./types";
import { GyazoProvider } from "./providers/GyazoProvider";
import { CloudflareR2Provider } from "./providers/CloudflareR2Provider";
import { GitHubProvider } from "./providers/GitHubProvider";
import { GoogleDriveProvider } from "./providers/GoogleDriveProvider";
import { S3Provider, type S3ProviderContext } from "./providers/S3Provider";

/**
 * S3 プロバイダー用のコンテキスト（getToken 必須。baseUrl は省略時は VITE_ZEDI_API_BASE_URL）
 */
export type StorageProviderContext = S3ProviderContext;

/**
 * ストレージ設定からプロバイダーインスタンスを取得
 * provider が "s3" のときは context.getToken が必須
 */
export function getStorageProvider(
  settings: StorageSettings,
  context?: StorageProviderContext
): StorageProviderInterface {
  const { provider, config } = settings;

  switch (provider) {
    case "s3":
      if (!context?.getToken) {
        throw new Error("Zedi (S3) を使うには getToken が必要です（ログインしてください）");
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
    case "gyazo":
      return !!config.gyazoAccessToken;

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

    case "s3":
      return true;

    default:
      return false;
  }
}

// Re-export types
export * from "./types";
export { GyazoProvider } from "./providers/GyazoProvider";
export { CloudflareR2Provider } from "./providers/CloudflareR2Provider";
export { GitHubProvider } from "./providers/GitHubProvider";
export { GoogleDriveProvider } from "./providers/GoogleDriveProvider";
export { S3Provider } from "./providers/S3Provider";
