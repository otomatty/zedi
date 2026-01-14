// AIクライアント生成と接続テスト機能

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import {
  AISettings,
  AIProviderType,
  CachedModels,
  getDefaultModels,
  OLLAMA_MODELS,
} from "@/types/ai";

export type AIClient = OpenAI | Anthropic | GoogleGenAI | OllamaClient;

// Ollamaクライアントクラス
export class OllamaClient {
  private endpoint: string;

  constructor(endpoint: string = "http://localhost:11434") {
    this.endpoint = endpoint.replace(/\/$/, ""); // 末尾のスラッシュを除去
  }

  async chat(
    model: string,
    messages: { role: "user" | "assistant" | "system"; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<string> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.message?.content ?? "";
  }

  async generate(
    model: string,
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<string> {
    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.response ?? "";
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.endpoint}/api/tags`);

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }

    const data = await response.json();
    return (data.models || []).map(
      (m: { name: string }) =>
        m.name.split(":")[0] + ":" + (m.name.split(":")[1] || "latest"),
    );
  }

  async pullModel(
    model: string,
    onProgress?: (status: string, completed?: number, total?: number) => void,
  ): Promise<void> {
    const response = await fetch(`${this.endpoint}/api/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (onProgress) {
            onProgress(data.status, data.completed, data.total);
          }
        } catch {
          // JSONパースエラーは無視
        }
      }
    }
  }

  async isModelAvailable(model: string): Promise<boolean> {
    try {
      const models = await this.listModels();
      const modelBase = model.split(":")[0];
      return models.some((m) => m.startsWith(modelBase));
    } catch {
      return false;
    }
  }

  getEndpoint(): string {
    return this.endpoint;
  }
}

// モデルキャッシュのストレージキー
const MODELS_CACHE_KEY = "zedi-ai-models-cache";
// キャッシュの有効期限（24時間）
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * AIクライアントを生成する
 */
export function createAIClient(settings: AISettings): AIClient {
  switch (settings.provider) {
    case "openai":
      return new OpenAI({
        apiKey: settings.apiKey,
        dangerouslyAllowBrowser: true, // Web App用
      });
    case "anthropic":
      return new Anthropic({
        apiKey: settings.apiKey,
      });
    case "google":
      return new GoogleGenAI({ apiKey: settings.apiKey });
    case "ollama":
      return new OllamaClient(settings.ollamaEndpoint);
    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  error?: string;
  models?: string[]; // 取得したモデル一覧
}

/**
 * キャッシュされたモデル一覧を取得
 */
export function getCachedModels(provider: AIProviderType): string[] | null {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (!cached) return null;

    const allCached: Record<string, CachedModels> = JSON.parse(cached);
    const providerCache = allCached[provider];

    if (!providerCache) return null;

    // キャッシュが期限切れかチェック
    if (Date.now() - providerCache.cachedAt > CACHE_TTL) {
      return null;
    }

    return providerCache.models;
  } catch {
    return null;
  }
}

/**
 * モデル一覧をキャッシュに保存
 */
export function saveCachedModels(
  provider: AIProviderType,
  models: string[],
): void {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    const allCached: Record<string, CachedModels> = cached
      ? JSON.parse(cached)
      : {};

    allCached[provider] = {
      provider,
      models,
      cachedAt: Date.now(),
    };

    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(allCached));
  } catch (error) {
    console.error("Failed to cache models:", error);
  }
}

/**
 * キャッシュをクリア
 */
export function clearModelsCache(): void {
  localStorage.removeItem(MODELS_CACHE_KEY);
}

/**
 * モデル一覧を取得（キャッシュ優先、なければデフォルト）
 */
export function getAvailableModels(provider: AIProviderType): string[] {
  const cached = getCachedModels(provider);
  if (cached && cached.length > 0) {
    return cached;
  }
  return getDefaultModels(provider);
}

/**
 * OpenAI APIからモデル一覧を取得
 */
async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const client = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const models = await client.models.list();

  // GPTモデルのみをフィルタリングし、チャット向けモデルを抽出
  const gptModels = models.data
    .filter((m) => {
      const id = m.id.toLowerCase();
      // チャット向けGPTモデルをフィルタ
      return (
        (id.includes("gpt-4") || id.includes("gpt-3.5")) &&
        !id.includes("instruct") &&
        !id.includes("vision") &&
        !id.includes("audio") &&
        !id.includes("realtime")
      );
    })
    .map((m) => m.id)
    .sort((a, b) => {
      // gpt-4o系を優先、その後gpt-4、最後にgpt-3.5
      const order = (id: string) => {
        if (id.includes("gpt-4o")) return 0;
        if (id.includes("gpt-4")) return 1;
        return 2;
      };
      return order(a) - order(b);
    });

  return gptModels.length > 0 ? gptModels : getDefaultModels("openai");
}

/**
 * Google AIからモデル一覧を取得
 */
async function fetchGoogleModels(apiKey: string): Promise<string[]> {
  // Google AI SDKはlistModels()を直接サポートしていないため、REST APIを使用
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();

  // Geminiモデルのみをフィルタリング
  const geminiModels = (data.models || [])
    .filter((m: { name: string; supportedGenerationMethods?: string[] }) => {
      const name = m.name.replace("models/", "");
      return (
        name.includes("gemini") &&
        m.supportedGenerationMethods?.includes("generateContent")
      );
    })
    .map((m: { name: string }) => m.name.replace("models/", ""))
    .sort((a: string, b: string) => {
      // gemini-2.0系を優先、その後1.5 pro、最後に1.5 flash
      const order = (id: string) => {
        if (id.includes("2.0")) return 0;
        if (id.includes("1.5-pro")) return 1;
        if (id.includes("1.5-flash")) return 2;
        return 3;
      };
      return order(a) - order(b);
    });

  return geminiModels.length > 0 ? geminiModels : getDefaultModels("google");
}

/**
 * Ollamaからモデル一覧を取得
 */
async function fetchOllamaModels(endpoint: string): Promise<string[]> {
  const client = new OllamaClient(endpoint);
  const installedModels = await client.listModels();

  if (installedModels.length > 0) {
    return installedModels;
  }

  // インストール済みモデルがない場合は推奨モデル一覧を返す
  return OLLAMA_MODELS.map((m) => m.name);
}

/**
 * OpenAI APIの接続テスト（モデル一覧も取得）
 */
async function testOpenAIConnection(
  apiKey: string,
): Promise<ConnectionTestResult> {
  try {
    const models = await fetchOpenAIModels(apiKey);

    // モデル取得成功時にキャッシュに保存
    saveCachedModels("openai", models);

    return {
      success: true,
      message: `接続成功！ ${models.length}個のモデルが利用可能です`,
      models,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (
      errorMessage.includes("401") ||
      errorMessage.includes("invalid_api_key")
    ) {
      return {
        success: false,
        message: "APIキーが無効です",
        error: errorMessage,
      };
    }

    return {
      success: false,
      message: "接続に失敗しました",
      error: errorMessage,
    };
  }
}

/**
 * Anthropic APIの接続テスト
 * Note: AnthropicはモデルリストAPIを公開していないため、デフォルトモデルを使用
 */
async function testAnthropicConnection(
  apiKey: string,
): Promise<ConnectionTestResult> {
  try {
    const client = new Anthropic({
      apiKey,
    });

    // 最小限のメッセージを送信して接続確認
    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 10,
      messages: [{ role: "user", content: "Hi" }],
    });

    if (response.id) {
      // Anthropicはモデル一覧APIがないため、デフォルトモデルを返す
      const models = getDefaultModels("anthropic");
      return {
        success: true,
        message: "接続成功！ Anthropic APIが利用可能です",
        models,
      };
    }

    return {
      success: false,
      message: "予期しないレスポンス形式です",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (
      errorMessage.includes("401") ||
      errorMessage.includes("authentication")
    ) {
      return {
        success: false,
        message: "APIキーが無効です",
        error: errorMessage,
      };
    }

    return {
      success: false,
      message: "接続に失敗しました",
      error: errorMessage,
    };
  }
}

/**
 * Google AI APIの接続テスト（モデル一覧も取得）
 */
async function testGoogleConnection(
  apiKey: string,
): Promise<ConnectionTestResult> {
  try {
    // モデル一覧を取得
    const models = await fetchGoogleModels(apiKey);

    // モデル取得成功時にキャッシュに保存
    saveCachedModels("google", models);

    return {
      success: true,
      message: `接続成功！ ${models.length}個のモデルが利用可能です`,
      models,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (
      errorMessage.includes("API_KEY_INVALID") ||
      errorMessage.includes("400")
    ) {
      return {
        success: false,
        message: "APIキーが無効です",
        error: errorMessage,
      };
    }

    return {
      success: false,
      message: "接続に失敗しました",
      error: errorMessage,
    };
  }
}

/**
 * Ollama接続テスト（ローカルモデル一覧も取得）
 */
async function testOllamaConnection(
  endpoint: string,
): Promise<ConnectionTestResult> {
  try {
    const client = new OllamaClient(endpoint);

    // まずバージョン確認でOllamaが起動しているかチェック
    const versionResponse = await fetch(`${endpoint}/api/version`);
    if (!versionResponse.ok) {
      throw new Error("Ollama is not running");
    }

    // インストール済みモデルを取得
    const models = await client.listModels();

    // モデル取得成功時にキャッシュに保存
    if (models.length > 0) {
      saveCachedModels("ollama", models);
    }

    if (models.length === 0) {
      return {
        success: true,
        message:
          "Ollamaに接続しました。モデルがインストールされていません。設定画面からモデルをダウンロードしてください。",
        models: OLLAMA_MODELS.map((m) => m.name), // 推奨モデル一覧を返す
      };
    }

    return {
      success: true,
      message: `接続成功！ ${models.length}個のモデルがインストール済みです`,
      models,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("NetworkError") ||
      errorMessage.includes("not running")
    ) {
      return {
        success: false,
        message:
          "Ollamaに接続できません。Ollamaが起動しているか確認してください。",
        error: `エンドポイント: ${endpoint}\n\nOllamaのインストール: https://ollama.ai/download\n起動コマンド: ollama serve`,
      };
    }

    return {
      success: false,
      message: "接続に失敗しました",
      error: errorMessage,
    };
  }
}

/**
 * 接続テストを実行する
 */
export async function testConnection(
  provider: AIProviderType,
  apiKey: string,
  ollamaEndpoint?: string,
): Promise<ConnectionTestResult> {
  // Ollama以外はAPIキーが必要
  if (provider !== "ollama" && (!apiKey || apiKey.trim() === "")) {
    return {
      success: false,
      message: "APIキーを入力してください",
    };
  }

  switch (provider) {
    case "openai":
      return testOpenAIConnection(apiKey);
    case "anthropic":
      return testAnthropicConnection(apiKey);
    case "google":
      return testGoogleConnection(apiKey);
    case "ollama":
      return testOllamaConnection(ollamaEndpoint || "http://localhost:11434");
    default:
      return {
        success: false,
        message: `不明なプロバイダー: ${provider}`,
      };
  }
}

/**
 * Ollamaモデルをダウンロード
 */
export async function downloadOllamaModel(
  modelName: string,
  endpoint: string = "http://localhost:11434",
  onProgress?: (status: string, completed?: number, total?: number) => void,
): Promise<void> {
  const client = new OllamaClient(endpoint);
  await client.pullModel(modelName, onProgress);

  // ダウンロード完了後、キャッシュを更新
  const models = await client.listModels();
  saveCachedModels("ollama", models);
}
