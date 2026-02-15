import type { EnvConfig } from "../types/index.js";

let _cached: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (_cached) return _cached;

  const required = (key: string): string => {
    const v = process.env[key];
    if (!v) throw new Error(`Missing required env var: ${key}`);
    return v;
  };

  _cached = {
    AURORA_CLUSTER_ARN: required("AURORA_CLUSTER_ARN"),
    DB_CREDENTIALS_SECRET: required("DB_CREDENTIALS_SECRET"),
    AURORA_DATABASE_NAME: process.env.AURORA_DATABASE_NAME || "zedi",
    THUMBNAIL_SECRETS_ARN: required("THUMBNAIL_SECRETS_ARN"),
    AI_SECRETS_ARN: required("AI_SECRETS_ARN"),
    RATE_LIMIT_TABLE: required("RATE_LIMIT_TABLE"),
    COGNITO_USER_POOL_ID: required("COGNITO_USER_POOL_ID"),
    COGNITO_REGION: process.env.COGNITO_REGION || process.env.AWS_REGION || "ap-northeast-1",
    CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
    THUMBNAIL_BUCKET: required("THUMBNAIL_BUCKET"),
    THUMBNAIL_CLOUDFRONT_URL: required("THUMBNAIL_CLOUDFRONT_URL"),
  };

  return _cached;
}
