// AI関連の型定義

export type AIProviderType = "openai" | "anthropic" | "google";

export type APIMode = "user_api_key" | "api_server";

export interface AISettings {
  provider: AIProviderType;
  apiKey: string; // ユーザーAPIキーモード時のみ使用
  apiMode?: APIMode; // API利用モード（後方互換性のためオプショナル）
  model: string;
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

// キャッシュされたモデル一覧
export interface CachedModels {
  provider: AIProviderType;
  models: string[];
  cachedAt: number; // タイムスタンプ
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "google",
    name: "Google",
    defaultModels: [
      "gemini-3-flash-preview",
      "gemini-3-pro-preview",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
    ],
    apiKeyPrefix: "AIza",
    apiKeyHelpUrl: "https://aistudio.google.com/app/apikey",
    placeholder: "AIza...",
    requiresApiKey: true,
    description: "Google の最新 Gemini モデル",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    apiKeyPrefix: "sk-",
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
    requiresApiKey: true,
    description: "OpenAI の GPT モデル",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultModels: [
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-haiku-20240307",
    ],
    apiKeyPrefix: "sk-ant-",
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
    requiresApiKey: true,
    description: "Anthropic の Claude モデル",
  },
];

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "google",
  apiKey: "",
  apiMode: "api_server", // デフォルトはAPIサーバー経由
  model: "gemini-2.5-flash",
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
