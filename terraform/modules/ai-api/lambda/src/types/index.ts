// =============================================================================
// AI API Types
// =============================================================================

export type AIProviderType = "openai" | "anthropic" | "google";
export type AIMessageRole = "user" | "assistant" | "system";
export type UserTier = "free" | "paid";
export type ApiMode = "system" | "user_key";

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export interface AIChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  feature?: string; // "wiki_generation" | "mermaid_generation" | "chat"
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

// =============================================================================
// Database model types
// =============================================================================

export interface AIModel {
  id: string; // e.g. "openai:gpt-4o-mini"
  provider: AIProviderType;
  model_id: string;
  display_name: string;
  tier_required: UserTier;
  input_cost_units: number;
  output_cost_units: number;
  is_active: boolean;
  sort_order: number;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: UserTier;
  status: "active" | "canceled" | "past_due" | "trialing";
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface TierBudget {
  tier: UserTier;
  monthly_budget_units: number;
  description: string | null;
}

export interface MonthlyUsage {
  user_id: string;
  year_month: string;
  total_cost_units: number;
  request_count: number;
}

// =============================================================================
// Service types
// =============================================================================

export interface UsageCheckResult {
  allowed: boolean;
  usagePercent: number;
  remaining: number;
  tier: UserTier;
  budgetUnits: number;
  consumedUnits: number;
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

// =============================================================================
// Environment
// =============================================================================

export interface EnvConfig {
  AURORA_CLUSTER_ARN: string;
  DB_CREDENTIALS_SECRET: string;
  AURORA_DATABASE_NAME: string;
  AI_SECRETS_ARN: string;
  RATE_LIMIT_TABLE: string;
  COGNITO_USER_POOL_ID: string;
  COGNITO_REGION: string;
  CORS_ORIGIN: string;
}
