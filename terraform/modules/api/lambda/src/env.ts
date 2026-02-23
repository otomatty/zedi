/**
 * 統合 API — 環境変数ローダー
 *
 * 4 Lambda からの全環境変数を統合管理する。
 * Optional な環境変数は空文字列をデフォルトとし、
 * 対応ルートが使用されない環境ではエラーにしない。
 */
import type { EnvConfig } from './types';

let _cached: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (_cached) return _cached;

  const required = (key: string): string => {
    const v = process.env[key];
    if (!v) throw new Error(`Missing required env var: ${key}`);
    return v;
  };

  const optional = (key: string, fallback = ''): string =>
    process.env[key] || fallback;

  _cached = {
    // Aurora DB (required)
    AURORA_CLUSTER_ARN: required('AURORA_CLUSTER_ARN'),
    DB_CREDENTIALS_SECRET: required('DB_CREDENTIALS_SECRET'),
    AURORA_DATABASE_NAME: optional('AURORA_DATABASE_NAME', 'zedi'),

    // Auth
    COGNITO_USER_POOL_ID: optional('COGNITO_USER_POOL_ID'),
    COGNITO_REGION: optional(
      'COGNITO_REGION',
      process.env.AWS_REGION || 'ap-northeast-1',
    ),

    // CORS
    CORS_ORIGIN: optional('CORS_ORIGIN', '*'),

    // Media
    MEDIA_BUCKET: optional('MEDIA_BUCKET'),

    // AI
    AI_SECRETS_ARN: optional('AI_SECRETS_ARN'),
    RATE_LIMIT_TABLE: optional('RATE_LIMIT_TABLE'),

    // Environment
    ENVIRONMENT: optional('ENVIRONMENT', 'dev'),

    // Subscription (Polar)
    POLAR_SECRET_ARN: optional('POLAR_SECRET_ARN'),

    // Thumbnail
    THUMBNAIL_SECRETS_ARN: optional('THUMBNAIL_SECRETS_ARN'),
    THUMBNAIL_BUCKET: optional('THUMBNAIL_BUCKET'),
    THUMBNAIL_CLOUDFRONT_URL: optional('THUMBNAIL_CLOUDFRONT_URL'),
  };

  return _cached;
}

/** テスト用: キャッシュをリセット */
export function resetEnvCache(): void {
  _cached = null;
}
