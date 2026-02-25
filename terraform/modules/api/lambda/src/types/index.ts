/**
 * 統合 API — 共通型定義
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from "aws-lambda";
import type { AwsDataApiPgDatabase } from "drizzle-orm/aws-data-api/pg";
import type * as schema from "../schema";

// ── Hono App Environment ────────────────────────────────────────────────────
export type AppEnv = {
  Bindings: {
    event: APIGatewayProxyEventV2WithJWTAuthorizer;
    lambdaContext: LambdaContext;
  };
  Variables: {
    /** users.id (UUID) — resolved from cognitoSub */
    userId: string;
    /** Cognito sub claim */
    cognitoSub: string;
    /** User email (optional) */
    userEmail?: string;
    /** Drizzle DB client */
    db: Database;
  };
};

export type Database = AwsDataApiPgDatabase<typeof schema>;

// ── Unified Environment Config ──────────────────────────────────────────────
export interface EnvConfig {
  // Aurora DB
  AURORA_CLUSTER_ARN: string;
  DB_CREDENTIALS_SECRET: string;
  AURORA_DATABASE_NAME: string;

  // Auth
  COGNITO_USER_POOL_ID: string;
  COGNITO_REGION: string;

  // CORS
  CORS_ORIGIN: string;

  // Media (S3)
  MEDIA_BUCKET: string;

  // AI
  AI_SECRETS_ARN: string;
  RATE_LIMIT_TABLE: string;

  // Environment
  ENVIRONMENT: string;

  // Subscription (Polar)
  POLAR_SECRET_ARN: string;

  // Thumbnail
  THUMBNAIL_SECRETS_ARN: string;
  THUMBNAIL_BUCKET: string;
  THUMBNAIL_CLOUDFRONT_URL: string;
}

// ── AI Types ────────────────────────────────────────────────────────────────
export type AIProviderType = "openai" | "anthropic" | "google";
export type AIMessageRole = "user" | "assistant" | "system";
export type UserTier = "free" | "pro";
export type ApiMode = "system" | "user_key";

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export interface AIChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  feature?: string;
  webSearchOptions?: { search_context_size: "medium" | "low" | "high" };
  useWebSearch?: boolean;
  useGoogleSearch?: boolean;
}

export interface AIChatRequest {
  provider: AIProviderType;
  model: string;
  messages: AIMessage[];
  options?: AIChatOptions;
}

export interface AIChatResponse {
  content: string;
  finishReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUnits: number;
    usagePercent: number;
  };
}

export interface SSEPayload {
  content?: string;
  done?: boolean;
  finishReason?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUnits: number;
    usagePercent: number;
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface UsageCheckResult {
  allowed: boolean;
  usagePercent: number;
  remaining: number;
  tier: UserTier;
  budgetUnits: number;
  consumedUnits: number;
}

// ── Thumbnail Types ─────────────────────────────────────────────────────────
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
