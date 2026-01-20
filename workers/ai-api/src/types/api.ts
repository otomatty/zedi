export type AIProviderType = "openai" | "anthropic" | "google";

export type AIMessageRole = "user" | "assistant" | "system";

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export interface AIChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
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
}
