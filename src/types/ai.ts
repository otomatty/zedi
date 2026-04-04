// AI関連の型定義 / AI-related type definitions

/**
 * AI プロバイダー種別。API 直接呼び出し 3 種 + Claude Code (Tauri desktop only)。
 * AI provider type. Three direct-API providers plus Claude Code (Tauri desktop only).
 */
export type AIProviderType = "openai" | "anthropic" | "google" | "claude-code";

/** User API key vs Zedi server API. */
export type APIMode = "user_api_key" | "api_server";

/**
 * 利用モードの論理的な 3 分類。`AISettings` の `provider` + `apiMode` から導出する。
 * Logical interaction mode derived from `AISettings.provider` + `apiMode`.
 */
export type AIInteractionMode = "default" | "user_api_key" | "claude_code";

/** Subscription tier for model access. */
export type UserTier = "free" | "pro";

/** Persisted AI preferences (provider, model, mode). */
export interface AISettings {
  provider: AIProviderType;
  apiKey: string; // ユーザーAPIキーモード時のみ使用
  apiMode?: APIMode; // API利用モード（後方互換性のためオプショナル）
  model: string; // model_id (API用) e.g. "gpt-4o-mini"
  modelId: string; // namespaced id e.g. "openai:gpt-4o-mini"
  isConfigured: boolean;
}

/**
 * AI プロバイダーが提供する機能セット（Issue #457）。
 * Capability matrix for an AI provider (Issue #457).
 */
export interface AICapabilities {
  /** テキスト生成 / Text generation */
  textGeneration: boolean;
  /** ローカルファイルアクセス（Claude Code のみ） / Local file access (Claude Code only) */
  fileAccess: boolean;
  /** コマンド実行（Claude Code のみ） / Command execution (Claude Code only) */
  commandExecution: boolean;
  /** Web 検索 / Web search */
  webSearch: boolean;
  /** MCP 統合（Claude Code のみ） / MCP integration (Claude Code only) */
  mcpIntegration: boolean;
  /** エージェントループ（Claude Code のみ） / Agent loop (Claude Code only) */
  agentLoop: boolean;
}

/**
 * AI プロバイダーの静的メタデータ。UI 表示・設定バリデーションに使う。
 * Static metadata for an AI provider. Used for UI rendering and settings validation.
 */
export interface AIProvider {
  id: AIProviderType;
  name: string;
  defaultModels: string[];
  apiKeyPrefix: string;
  apiKeyHelpUrl: string;
  placeholder: string;
  requiresApiKey: boolean;
  description?: string;
  capabilities: AICapabilities;
  /**
   * デスクトップ環境（Tauri）でのみ利用可能か。
   * Whether this provider requires a desktop (Tauri) environment.
   */
  desktopOnly?: boolean;
}

// サーバーから取得するモデル情報
/** Model row returned from the server models API. */
export interface AIModel {
  id: string; // e.g. "openai:gpt-4o-mini"
  provider: AIProviderType;
  modelId: string; // API用モデルID e.g. "gpt-4o-mini"
  displayName: string;
  tierRequired: UserTier;
  available: boolean; // ユーザーのティアでアクセス可能か
  inputCostUnits: number;
  outputCostUnits: number;
}

// AI使用量情報
/** Usage quota snapshot for the current billing period. */
export interface AIUsage {
  usagePercent: number;
  consumedUnits: number;
  budgetUnits: number;
  remaining: number;
  tier: UserTier;
  yearMonth: string;
}

// AIレスポンスに含まれるusage情報
/** Token/cost usage attached to a completion response. */
export interface AIResponseUsage {
  inputTokens: number;
  outputTokens: number;
  costUnits: number;
  usagePercent: number;
}

// キャッシュされたモデル一覧（レガシー：ユーザーAPIキーモード用）
/** Legacy cache of model id strings for user-key mode. */
export interface CachedModels {
  provider: AIProviderType;
  models: string[];
  cachedAt: number; // タイムスタンプ
}

// サーバーから取得したモデル一覧のキャッシュ
/** Cached server model list + tier from `/api/ai/models`. */
export interface CachedServerModels {
  models: AIModel[];
  tier: UserTier;
  cachedAt: number;
}

/** API 経由のプロバイダー共通ケーパビリティ / Common capabilities for direct-API providers */
const API_PROVIDER_CAPABILITIES: AICapabilities = {
  textGeneration: true,
  fileAccess: false,
  commandExecution: false,
  webSearch: true,
  mcpIntegration: false,
  agentLoop: false,
};

/** Claude Code (Sidecar) のケーパビリティ / Claude Code sidecar capabilities */
const CLAUDE_CODE_CAPABILITIES: AICapabilities = {
  textGeneration: true,
  fileAccess: true,
  commandExecution: true,
  webSearch: true,
  mcpIntegration: true,
  agentLoop: true,
};

// モデル方針: Gemini 3.x / GPT-5 / Claude 4 以上のみ
/** Static registry of AI providers for settings UI. */
export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "google",
    name: "Google",
    defaultModels: ["gemini-3-flash-preview", "gemini-3-pro-preview"],
    apiKeyPrefix: "AIza",
    apiKeyHelpUrl: "https://aistudio.google.com/app/apikey",
    placeholder: "AIza...",
    requiresApiKey: true,
    description: "Google Gemini 3 モデル",
    capabilities: API_PROVIDER_CAPABILITIES,
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModels: ["gpt-5.2", "gpt-5-mini", "gpt-5-nano"],
    apiKeyPrefix: "sk-",
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
    requiresApiKey: true,
    description: "OpenAI GPT-5 モデル",
    capabilities: API_PROVIDER_CAPABILITIES,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultModels: ["claude-opus-4-6", "claude-sonnet-4-20250514"],
    apiKeyPrefix: "sk-ant-",
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
    requiresApiKey: true,
    description: "Anthropic Claude 4 モデル",
    capabilities: API_PROVIDER_CAPABILITIES,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    defaultModels: [],
    apiKeyPrefix: "",
    apiKeyHelpUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    placeholder: "",
    requiresApiKey: false,
    description: "Claude Code (デスクトップ専用 / Desktop only)",
    capabilities: CLAUDE_CODE_CAPABILITIES,
    desktopOnly: true,
  },
];

/** Default settings when none are stored yet. */
export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "google",
  apiKey: "",
  apiMode: "api_server",
  model: "gemini-3-flash-preview",
  modelId: "google:gemini-3-flash-preview",
  isConfigured: false,
};

/**
 * サーバー API で使えるプロバイダーのみ（claude-code 除外）。
 * Providers usable via server API (excludes claude-code).
 */
export type APIProviderType = Exclude<AIProviderType, "claude-code">;

/**
 * API 直接呼び出し用プロバイダーのみのリスト。
 * List of direct-API providers only (no desktop-only entries).
 */
export const API_ONLY_PROVIDERS: AIProvider[] = AI_PROVIDERS.filter((p) => !p.desktopOnly);

/** Look up provider metadata by id. */
export function getProviderById(id: AIProviderType): AIProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

/**
 * プロバイダーが API キー方式（直接 API）のプロバイダーかどうか。
 * Whether the provider type is a direct-API provider (not claude-code).
 */
export function isAPIProvider(id: AIProviderType): id is APIProviderType {
  return id !== "claude-code";
}

/** First default model id for a provider. */
export function getDefaultModel(provider: AIProviderType): string {
  const providerInfo = getProviderById(provider);
  return providerInfo?.defaultModels[0] ?? "";
}

/** Default model list for a provider. */
export function getDefaultModels(provider: AIProviderType): string[] {
  const providerInfo = getProviderById(provider);
  return providerInfo?.defaultModels ?? [];
}

/**
 * `AISettings` から論理的な利用モードを導出する。
 * Derives the logical interaction mode from settings.
 */
export function getInteractionMode(settings: AISettings): AIInteractionMode {
  if (settings.provider === "claude-code") return "claude_code";
  if (settings.apiMode === "user_api_key") return "user_api_key";
  return "default";
}
