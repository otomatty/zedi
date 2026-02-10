// AI関連の型定義

export type AIProviderType = "openai" | "anthropic" | "google";

export type APIMode = "user_api_key" | "api_server";

export type UserTier = "free" | "paid";

export interface AISettings {
  provider: AIProviderType;
  apiKey: string; // ユーザーAPIキーモード時のみ使用
  apiMode?: APIMode; // API利用モード（後方互換性のためオプショナル）
  model: string; // model_id (API用) e.g. "gpt-4o-mini"
  modelId: string; // namespaced id e.g. "openai:gpt-4o-mini"
  isConfigured: boolean;
}

export interface AIProvider {
  id: AIProviderType;
  name: string;
  defaultModels: string[]; // フォールバック用のデフォルトモデル
  apiKeyPrefix: string;
  apiKeyHelpUrl: string;
  placeholder: string;
  requiresApiKey: boolean;
  description?: string;
}

// サーバーから取得するモデル情報
export interface AIModel {
  id: string; // e.g. "openai:gpt-4o-mini"
  provider: AIProviderType;
  modelId: string; // API用モデルID e.g. "gpt-4o-mini"
  displayName: string;
  tierRequired: UserTier;
  available: boolean; // ユーザーのティアでアクセス可能か
}

// AI使用量情報
export interface AIUsage {
  usagePercent: number;
  consumedUnits: number;
  budgetUnits: number;
  remaining: number;
  tier: UserTier;
  yearMonth: string;
}

// AIレスポンスに含まれるusage情報
export interface AIResponseUsage {
  inputTokens: number;
  outputTokens: number;
  costUnits: number;
  usagePercent: number;
}

// キャッシュされたモデル一覧（レガシー：ユーザーAPIキーモード用）
export interface CachedModels {
  provider: AIProviderType;
  models: string[];
  cachedAt: number; // タイムスタンプ
}

// サーバーから取得したモデル一覧のキャッシュ
export interface CachedServerModels {
  models: AIModel[];
  tier: UserTier;
  cachedAt: number;
}

// モデル方針: Gemini 3.x / GPT-5 / Claude 4 以上のみ
export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "google",
    name: "Google",
    defaultModels: [
      "gemini-3-flash-preview",
      "gemini-3-pro-preview",
    ],
    apiKeyPrefix: "AIza",
    apiKeyHelpUrl: "https://aistudio.google.com/app/apikey",
    placeholder: "AIza...",
    requiresApiKey: true,
    description: "Google Gemini 3 モデル",
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
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultModels: [
      "claude-opus-4-6",
      "claude-sonnet-4-20250514",
    ],
    apiKeyPrefix: "sk-ant-",
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
    requiresApiKey: true,
    description: "Anthropic Claude 4 モデル",
  },
];

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "google",
  apiKey: "",
  apiMode: "api_server",
  model: "gemini-3-flash-preview",
  modelId: "google:gemini-3-flash-preview",
  isConfigured: false,
};

export function getProviderById(id: AIProviderType): AIProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

export function getDefaultModel(provider: AIProviderType): string {
  const providerInfo = getProviderById(provider);
  return providerInfo?.defaultModels[0] ?? "";
}

export function getDefaultModels(provider: AIProviderType): string[] {
  const providerInfo = getProviderById(provider);
  return providerInfo?.defaultModels ?? [];
}
