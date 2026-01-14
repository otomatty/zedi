// AI関連の型定義

export type AIProviderType = "openai" | "anthropic" | "google" | "ollama";

export interface AISettings {
  provider: AIProviderType;
  apiKey: string;
  model: string;
  isConfigured: boolean;
  // Ollama用の追加設定
  ollamaEndpoint?: string; // デフォルト: http://localhost:11434
}

export interface AIProvider {
  id: AIProviderType;
  name: string;
  defaultModels: string[]; // フォールバック用のデフォルトモデル
  apiKeyPrefix: string;
  apiKeyHelpUrl: string;
  placeholder: string;
  requiresApiKey: boolean; // Ollamaはキー不要
  description?: string;
}

// キャッシュされたモデル一覧
export interface CachedModels {
  provider: AIProviderType;
  models: string[];
  cachedAt: number; // タイムスタンプ
}

// Ollamaモデル情報（スペック選択用）
export interface OllamaModelInfo {
  name: string;
  displayName: string;
  parameterSize: string; // "7B", "13B", "70B" など
  description: string;
  minRAM: number; // 必要最小RAM (GB)
  recommendedRAM: number; // 推奨RAM (GB)
  category: "lightweight" | "balanced" | "high-performance";
}

// 2025年1月時点で利用可能な高性能Ollamaモデル
export const OLLAMA_MODELS: OllamaModelInfo[] = [
  // Lightweight (8GB RAM以下)
  {
    name: "llama3.2:3b",
    displayName: "Llama 3.2 3B",
    parameterSize: "3B",
    description: "軽量で高速。基本的な要約タスクに最適",
    minRAM: 4,
    recommendedRAM: 6,
    category: "lightweight",
  },
  {
    name: "gemma2:2b",
    displayName: "Gemma 2 2B",
    parameterSize: "2B",
    description: "Googleの軽量モデル。効率的な推論",
    minRAM: 4,
    recommendedRAM: 6,
    category: "lightweight",
  },
  {
    name: "phi3:mini",
    displayName: "Phi-3 Mini",
    parameterSize: "3.8B",
    description: "Microsoftの小型高性能モデル",
    minRAM: 4,
    recommendedRAM: 8,
    category: "lightweight",
  },
  {
    name: "qwen2.5:3b",
    displayName: "Qwen 2.5 3B",
    parameterSize: "3B",
    description: "Alibabaの最新軽量モデル。日本語対応良好",
    minRAM: 4,
    recommendedRAM: 6,
    category: "lightweight",
  },
  // Balanced (16GB RAM)
  {
    name: "llama3.2:latest",
    displayName: "Llama 3.2 8B",
    parameterSize: "8B",
    description: "バランス型。多くのタスクに対応",
    minRAM: 8,
    recommendedRAM: 16,
    category: "balanced",
  },
  {
    name: "gemma2:9b",
    displayName: "Gemma 2 9B",
    parameterSize: "9B",
    description: "Google製。高品質な出力",
    minRAM: 8,
    recommendedRAM: 16,
    category: "balanced",
  },
  {
    name: "qwen2.5:7b",
    displayName: "Qwen 2.5 7B",
    parameterSize: "7B",
    description: "日本語性能が高い。コーディングも得意",
    minRAM: 8,
    recommendedRAM: 16,
    category: "balanced",
  },
  {
    name: "mistral:7b",
    displayName: "Mistral 7B",
    parameterSize: "7B",
    description: "フランス発。効率的で高性能",
    minRAM: 8,
    recommendedRAM: 16,
    category: "balanced",
  },
  {
    name: "deepseek-r1:8b",
    displayName: "DeepSeek R1 8B",
    parameterSize: "8B",
    description: "推論特化モデル。論理的なタスクに強い",
    minRAM: 8,
    recommendedRAM: 16,
    category: "balanced",
  },
  // High Performance (32GB+ RAM)
  {
    name: "llama3.3:70b",
    displayName: "Llama 3.3 70B",
    parameterSize: "70B",
    description: "最高性能。複雑なタスクに最適",
    minRAM: 48,
    recommendedRAM: 64,
    category: "high-performance",
  },
  {
    name: "qwen2.5:32b",
    displayName: "Qwen 2.5 32B",
    parameterSize: "32B",
    description: "高性能日本語対応。詳細な要約に最適",
    minRAM: 24,
    recommendedRAM: 32,
    category: "high-performance",
  },
  {
    name: "gemma2:27b",
    displayName: "Gemma 2 27B",
    parameterSize: "27B",
    description: "Google製大規模モデル。高品質出力",
    minRAM: 20,
    recommendedRAM: 32,
    category: "high-performance",
  },
  {
    name: "deepseek-r1:32b",
    displayName: "DeepSeek R1 32B",
    parameterSize: "32B",
    description: "推論特化大規模モデル。分析タスクに最適",
    minRAM: 24,
    recommendedRAM: 32,
    category: "high-performance",
  },
  {
    name: "mixtral:8x7b",
    displayName: "Mixtral 8x7B",
    parameterSize: "47B (MoE)",
    description: "Mixture of Experts。効率的な大規模モデル",
    minRAM: 32,
    recommendedRAM: 48,
    category: "high-performance",
  },
  {
    name: "command-r:35b",
    displayName: "Command R 35B",
    parameterSize: "35B",
    description: "Cohere製。指示追従性が高い",
    minRAM: 24,
    recommendedRAM: 40,
    category: "high-performance",
  },
];

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "ollama",
    name: "Ollama (ローカル)",
    defaultModels: OLLAMA_MODELS.map((m) => m.name),
    apiKeyPrefix: "",
    apiKeyHelpUrl: "https://ollama.ai/download",
    placeholder: "APIキー不要",
    requiresApiKey: false,
    description: "ローカルで実行。データが外部に送信されません",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    apiKeyPrefix: "sk-",
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
    requiresApiKey: true,
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
  },
  {
    id: "google",
    name: "Google",
    defaultModels: [
      "gemini-2.0-flash-exp",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
    apiKeyPrefix: "AIza",
    apiKeyHelpUrl: "https://aistudio.google.com/app/apikey",
    placeholder: "AIza...",
    requiresApiKey: true,
  },
];

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "ollama",
  apiKey: "",
  model: "qwen2.5:7b", // 日本語対応が良いデフォルト
  isConfigured: false,
  ollamaEndpoint: "http://localhost:11434",
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

export function getOllamaModelInfo(
  modelName: string,
): OllamaModelInfo | undefined {
  return OLLAMA_MODELS.find((m) => m.name === modelName);
}

export function getOllamaModelsByCategory(
  category: OllamaModelInfo["category"],
): OllamaModelInfo[] {
  return OLLAMA_MODELS.filter((m) => m.category === category);
}

export function getRecommendedOllamaModel(
  availableRAM: number,
): OllamaModelInfo {
  // 利用可能なRAMに基づいて最適なモデルを推奨
  const sortedModels = [...OLLAMA_MODELS].sort(
    (a, b) => b.recommendedRAM - a.recommendedRAM,
  );

  for (const model of sortedModels) {
    if (availableRAM >= model.recommendedRAM) {
      return model;
    }
  }

  // 最小要件を満たすモデルがない場合は最軽量モデルを返す
  return (
    OLLAMA_MODELS.find((m) => m.category === "lightweight") ?? OLLAMA_MODELS[0]
  );
}
