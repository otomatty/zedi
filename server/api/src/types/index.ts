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

/** OpenAI-style function tool definition passed to provider APIs. */
export interface ZediFunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

/** LangChain `bindTools` / OpenAI-compatible tool entry. */
export interface ZediChatTool {
  type: "function";
  function: ZediFunctionDefinition;
}

/** Force a specific function tool (OpenAI-compatible shape). */
export interface ZediToolChoiceFunction {
  type: "function";
  function: { name: string };
}

/** Provider tool-choice hint for non-streaming calls. */
export type ZediToolChoice = "auto" | "none" | "required" | ZediToolChoiceFunction;

/** Parsed tool call returned by `callProvider` when the model selects a tool. */
export interface ZediToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Standard non-streaming provider response from `callOpenAI` / `callAnthropic` / `callGoogle`. */
export interface AIProviderCallResult {
  content: string;
  usage: TokenUsage;
  finishReason: string;
  toolCalls?: ZediToolCall[];
}

export interface AIChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  feature?: string;
  webSearchOptions?: { search_context_size: "medium" | "low" | "high" };
  useWebSearch?: boolean;
  useGoogleSearch?: boolean;
  /** Function tools for structured output / tool calling (non-streaming). */
  tools?: ZediChatTool[];
  /** Optional tool-choice hint; defaults to provider-specific auto behaviour. */
  toolChoice?: ZediToolChoice;
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
  /** Resolved model id after fallback / フォールバック後に解決されたモデル ID */
  modelId?: string;
  /** True when a different model was used than requested / 要求と異なるモデルが使われた */
  didFallback?: boolean;
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
