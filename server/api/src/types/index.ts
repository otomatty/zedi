import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../schema/index.js";

export type AppEnv = {
  Variables: {
    userId: string;
    userEmail?: string;
    db: Database;
    redis: import("ioredis").Redis;
  };
};

export type Database = NodePgDatabase<typeof schema>;

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
