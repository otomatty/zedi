export interface EnvConfig {
  AURORA_CLUSTER_ARN: string;
  DB_CREDENTIALS_SECRET: string;
  AURORA_DATABASE_NAME: string;
  THUMBNAIL_SECRETS_ARN: string;
  AI_SECRETS_ARN: string;
  RATE_LIMIT_TABLE: string;
  COGNITO_USER_POOL_ID: string;
  COGNITO_REGION: string;
  CORS_ORIGIN: string;
  THUMBNAIL_BUCKET: string;
  THUMBNAIL_CLOUDFRONT_URL: string;
}

export interface ImageSearchItem {
  id: string;
  previewUrl: string;
  imageUrl: string;
  alt: string;
  sourceName: string;
  sourceUrl: string;
  authorName?: string;
  authorUrl?: string;
}

export interface ImageSearchResponse {
  items: ImageSearchItem[];
  nextCursor?: string;
}

export interface ImageGenerateResponse {
  imageUrl: string;
  mimeType: string;
}

export interface CommitResponse {
  imageUrl: string;
  provider: "s3";
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: "free" | "pro";
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
}
