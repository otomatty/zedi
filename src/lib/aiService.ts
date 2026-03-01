// AIサービス抽象化レイヤー
// モードに応じて適切な方法でAPIを呼び出す

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AISettings, AIProviderType, APIMode, AIResponseUsage, UserTier } from "@/types/ai";

/** Uses same base URL as REST API (VITE_API_BASE_URL). */
const getAIAPIBaseUrl = () => (import.meta.env.VITE_API_BASE_URL as string) ?? "";

export interface AIServiceRequest {
  provider: AIProviderType;
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    feature?: string; // "wiki_generation" | "mermaid_generation" | "chat"
    // OpenAI固有のオプション
    webSearchOptions?: { search_context_size: "medium" | "low" | "high" };
    // Anthropic固有のオプション
    useWebSearch?: boolean;
    // Google固有のオプション
    useGoogleSearch?: boolean;
  };
}

export interface AIServiceResponse {
  content: string;
  finishReason?: string;
  usage?: AIResponseUsage; // サーバーモード時のみ
}

export interface AIServiceCallbacks {
  onChunk?: (chunk: string) => void;
  onComplete?: (response: AIServiceResponse) => void;
  onError?: (error: Error) => void;
  onUsageUpdate?: (usage: AIResponseUsage) => void;
}

/**
 * 有効なAPIモードを取得（後方互換性対応）
 */
export function getEffectiveAPIMode(settings: AISettings): APIMode {
  // 既存の設定にapiModeがない場合の後方互換性
  if (!settings.apiMode) {
    // apiKeyが設定されている場合はuser_api_key、そうでなければapi_server
    return settings.apiKey.trim() !== "" ? "user_api_key" : "api_server";
  }
  return settings.apiMode;
}

/**
 * ユーザーAPIキーを使用するかどうかを判定
 */
export function shouldUseUserAPIKey(settings: AISettings): boolean {
  return getEffectiveAPIMode(settings) === "user_api_key";
}

/**
 * ストリーミング対応のAIサービス呼び出し
 */
export async function callAIService(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const apiMode = getEffectiveAPIMode(settings);

  if (apiMode === "user_api_key") {
    // 既存の実装を使用（直接API呼び出し）
    return await callAIWithUserKey(settings, request, callbacks, abortSignal);
  }

  // APIサーバー経由: バックエンドは aiModels.id（DB主キー）で検索するため、modelId を送る
  return await callAIWithServer(
    { ...request, model: settings.modelId ?? request.model },
    callbacks,
    abortSignal,
  );
}

/**
 * ユーザーAPIキーで直接呼び出し
 */
async function callAIWithUserKey(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  try {
    switch (settings.provider) {
      case "openai":
        await callOpenAI(settings, request, callbacks, abortSignal);
        break;
      case "anthropic":
        await callAnthropic(settings, request, callbacks, abortSignal);
        break;
      case "google":
        await callGoogle(settings, request, callbacks, abortSignal);
        break;
      default:
        throw new Error(`Unknown provider: ${settings.provider}`);
    }
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error("AI API呼び出しエラー"));
  }
}

/**
 * APIサーバー経由で呼び出し（SSE ストリーミング via POST /api/ai/chat）
 */
async function callAIWithServer(
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  return callAIWithServerHTTP(request, callbacks, abortSignal);
}

/** SSE 1行（data: ペイロード）を処理し、ストリーム完了なら true を返す */
function processSSEDataLine(
  payload: string,
  state: { fullContent: string; finishReason?: string; lastUsage?: AIResponseUsage },
  callbacks: AIServiceCallbacks,
): boolean {
  const data = JSON.parse(payload) as {
    content?: string;
    done?: boolean;
    finishReason?: string;
    error?: string;
    usage?: AIResponseUsage;
  };
  if (data.error) {
    throw new Error(data.error);
  }
  if (data.content) {
    state.fullContent += data.content;
    callbacks.onChunk?.(data.content);
  }
  if (data.usage) {
    state.lastUsage = data.usage;
    callbacks.onUsageUpdate?.(data.usage);
  }
  if (data.done) {
    state.finishReason = data.finishReason;
    callbacks.onComplete?.({
      content: state.fullContent,
      finishReason: state.finishReason,
      usage: state.lastUsage,
    });
    return true;
  }
  return false;
}

/** HTTP ストリーミングレスポンスを SSE として読み、onComplete まで処理する。正常完了時は true を返す。 */
async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { fullContent: string; finishReason?: string; lastUsage?: AIResponseUsage },
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (abortSignal?.aborted) {
      throw new Error("ABORTED");
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.startsWith("data:")) {
        newlineIndex = buffer.indexOf("\n");
        continue;
      }
      const payload = line.slice(5).trim();
      if (!payload) {
        newlineIndex = buffer.indexOf("\n");
        continue;
      }
      if (processSSEDataLine(payload, state, callbacks)) {
        await reader.cancel();
        return true;
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }
  return false;
}

async function fetchAIChatResponse(
  request: AIServiceRequest,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("AI APIサーバーのURLが設定されていません");
  }
  const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: request.provider,
      model: request.model,
      messages: request.messages,
      options: request.options,
    }),
    credentials: "include",
    signal: abortSignal,
  });
  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error || response.statusText || "AI API呼び出しエラー";
    throw new Error(message);
  }
  return response;
}

async function handleAIChatHttpResponse(
  response: Response,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (request.options?.stream) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("ストリーミングレスポンスが取得できません");
    }
    const state = {
      fullContent: "",
      finishReason: undefined as string | undefined,
      lastUsage: undefined as AIResponseUsage | undefined,
    };
    const streamCompleted = await consumeSSEStream(reader, state, callbacks, abortSignal);
    if (!streamCompleted && state.fullContent) {
      callbacks.onComplete?.({
        content: state.fullContent,
        finishReason: state.finishReason,
        usage: state.lastUsage,
      });
    } else if (!streamCompleted && !state.fullContent) {
      callbacks.onError?.(new Error("ストリーミングレスポンスが空のまま切断されました"));
    }
    return;
  }
  const data = (await response.json()) as AIServiceResponse;
  if (data.usage) {
    callbacks.onUsageUpdate?.(data.usage);
  }
  callbacks.onComplete?.({
    content: data.content ?? "",
    finishReason: data.finishReason,
    usage: data.usage,
  });
}

/**
 * HTTP API経由の呼び出し（フォールバック、非ストリーミング）
 */
async function callAIWithServerHTTP(
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  try {
    const response = await fetchAIChatResponse(request, abortSignal);
    await handleAIChatHttpResponse(response, request, callbacks, abortSignal);
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error("AI API呼び出しエラー"));
  }
}

async function callOpenAIStream(
  client: OpenAI,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const stream = await client.chat.completions.create(
    {
      model: request.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: request.options?.maxTokens ?? 4000,
      temperature: request.options?.temperature ?? 0.7,
      stream: true,
      web_search_options: request.options?.webSearchOptions,
    },
    { signal: abortSignal },
  );
  let fullContent = "";
  for await (const chunk of stream) {
    if (abortSignal?.aborted) {
      throw new Error("ABORTED");
    }
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      fullContent += content;
      callbacks.onChunk?.(content);
    }
  }
  callbacks.onComplete?.({
    content: fullContent,
    finishReason: "stop",
  });
}

async function callOpenAINonStream(
  client: OpenAI,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const response = await client.chat.completions.create(
    {
      model: request.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: request.options?.maxTokens ?? 4000,
      temperature: request.options?.temperature ?? 0.7,
      stream: false,
    },
    { signal: abortSignal },
  );
  const content = response.choices[0]?.message?.content || "";
  callbacks.onComplete?.({
    content,
    finishReason: response.choices[0]?.finish_reason,
  });
}

/**
 * OpenAI API呼び出し
 */
async function callOpenAI(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
  });
  if (request.options?.stream) {
    await callOpenAIStream(client, request, callbacks, abortSignal);
  } else {
    await callOpenAINonStream(client, request, callbacks, abortSignal);
  }
}

/**
 * Anthropic API呼び出し
 */
async function callAnthropic(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
  });

  // Web検索をサポートするClaudeモデルかどうかを判定
  const isClaudeWebSearchSupported = (model: string): boolean => {
    const supportedPatterns = [
      "claude-opus-4",
      "claude-sonnet-4",
      "claude-sonnet-3.7",
      "claude-sonnet-3-5-sonnet",
      "claude-3-5-sonnet",
      "claude-haiku-3.5",
      "claude-3-5-haiku",
    ];
    return supportedPatterns.some((pattern) => model.toLowerCase().includes(pattern.toLowerCase()));
  };

  const useWebSearch = request.options?.useWebSearch ?? isClaudeWebSearchSupported(request.model);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestParams: any = {
    model: request.model,
    max_tokens: request.options?.maxTokens ?? 4000,
    messages: request.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };

  // Web検索対応モデルの場合、Web検索ツールを追加
  if (useWebSearch) {
    requestParams.tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ];
  }

  if (request.options?.stream) {
    // ストリーミング処理
    const stream = client.messages.stream(requestParams, { signal: abortSignal });

    let fullContent = "";

    for await (const event of stream) {
      if (abortSignal?.aborted) {
        throw new Error("ABORTED");
      }

      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const content = event.delta.text;
        fullContent += content;
        callbacks.onChunk?.(content);
      }
    }

    callbacks.onComplete?.({
      content: fullContent,
      finishReason: "stop",
    });
  } else {
    // 非ストリーミング処理
    const response = await client.messages.create(requestParams, {
      signal: abortSignal,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content = textBlock && textBlock.type === "text" ? textBlock.text : "";

    callbacks.onComplete?.({
      content,
      finishReason: response.stop_reason,
    });
  }
}

/**
 * Google AI API呼び出し
 */
async function callGoogle(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new GoogleGenAI({ apiKey: settings.apiKey });

  const useGoogleSearch = request.options?.useGoogleSearch ?? true;

  // Google Search ツール（Gemini 2.0以降で推奨）
  const tools = useGoogleSearch
    ? [
        {
          googleSearch: {},
        },
      ]
    : undefined;

  if (request.options?.stream) {
    // ストリーミング処理
    const response = await client.models.generateContentStream({
      model: request.model,
      contents: request.messages.map((msg) => msg.content).join("\n\n"),
      config: {
        tools,
        maxOutputTokens: request.options?.maxTokens ?? 4000,
        temperature: request.options?.temperature ?? 0.7,
      },
    });

    let fullContent = "";

    for await (const chunk of response) {
      if (abortSignal?.aborted) {
        throw new Error("ABORTED");
      }

      const content = chunk.text;
      if (content) {
        fullContent += content;
        callbacks.onChunk?.(content);
      }
    }

    callbacks.onComplete?.({
      content: fullContent,
      finishReason: "stop",
    });
  } else {
    // 非ストリーミング処理
    const response = await client.models.generateContent({
      model: request.model,
      contents: request.messages.map((msg) => msg.content).join("\n\n"),
      config: {
        tools,
        temperature: request.options?.temperature ?? 0.7,
      },
    });

    const content = response.text || "";
    callbacks.onComplete?.({
      content,
      finishReason: "stop",
    });
  }
}

// =============================================================================
// Server API functions (models, usage)
// =============================================================================

import type { AIModel, AIUsage, CachedServerModels } from "@/types/ai";

const SERVER_MODELS_CACHE_KEY = "zedi-ai-server-models";
const SERVER_MODELS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/** API/cache の snake_case または camelCase を AIModel に正規化 */
function normalizeToAIModel(raw: Record<string, unknown>): AIModel {
  const rawTier = (raw.tierRequired ?? raw.tier_required) as string | undefined;
  const tierRequired: UserTier = rawTier === "pro" ? "pro" : "free";
  return {
    id: (raw.id as string) ?? "",
    provider: (raw.provider as AIModel["provider"]) ?? "google",
    modelId: (raw.modelId as string) ?? (raw.model_id as string) ?? "",
    displayName: (raw.displayName as string) ?? (raw.display_name as string) ?? "",
    tierRequired,
    available: (raw.available as boolean) ?? false,
    inputCostUnits: (raw.inputCostUnits as number) ?? (raw.input_cost_units as number) ?? 0,
    outputCostUnits: (raw.outputCostUnits as number) ?? (raw.output_cost_units as number) ?? 0,
  };
}

/** モデル一覧取得失敗時の詳細付きエラー */
export class FetchServerModelsError extends Error {
  constructor(
    message: string,
    public readonly code: "NO_BASE_URL" | "NETWORK" | "HTTP" | "INVALID_RESPONSE",
    public readonly details?: { status?: number; statusText?: string; body?: string },
  ) {
    super(message);
    this.name = "FetchServerModelsError";
  }
}

async function fetchModelsFromApi(
  apiBaseUrl: string,
): Promise<{ models: AIModel[]; tier: string }> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/ai/models`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch (e) {
    const message =
      e instanceof TypeError && e.message.includes("fetch")
        ? `ネットワークエラー: ${apiBaseUrl} に接続できません。CORS または URL を確認してください。`
        : `リクエスト失敗: ${e instanceof Error ? e.message : String(e)}`;
    const err = new FetchServerModelsError(message, "NETWORK", {
      body: e instanceof Error ? e.message : String(e),
    });
    console.error("[fetchServerModels]", message, e);
    throw err;
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (e) {
    const err = new FetchServerModelsError(
      `レスポンスの読み取りに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      "NETWORK",
    );
    console.error("[fetchServerModels]", err.message, e);
    throw err;
  }

  if (!response.ok) {
    const err = new FetchServerModelsError("API エラーが発生しました", "HTTP", {
      status: response.status,
      statusText: response.statusText,
      body: bodyText.slice(0, 500),
    });
    console.error("[fetchServerModels]", {
      status: response.status,
      statusText: response.statusText,
      body: bodyText.slice(0, 500),
    });
    throw err;
  }

  let data: { models?: unknown[]; tier?: UserTier };
  try {
    data = JSON.parse(bodyText) as { models?: unknown[]; tier?: UserTier };
  } catch (_e) {
    const err = new FetchServerModelsError("レスポンスが JSON ではありません", "INVALID_RESPONSE", {
      body: bodyText.slice(0, 500),
    });
    console.error("[fetchServerModels]", { body: bodyText.slice(0, 500) });
    throw err;
  }

  if (!Array.isArray(data.models)) {
    const err = new FetchServerModelsError("API のレスポンス形式が不正です", "INVALID_RESPONSE", {
      body: bodyText.slice(0, 500),
    });
    console.error("[fetchServerModels]", { body: bodyText.slice(0, 500) });
    throw err;
  }

  const models = data.models.map((m) => normalizeToAIModel((m as Record<string, unknown>) ?? {}));
  const tier: UserTier = data.tier === "pro" ? "pro" : "free";
  return { models, tier };
}

/**
 * サーバーから利用可能なモデル一覧を取得（キャッシュあり）
 * @throws {FetchServerModelsError} 取得失敗時（URL未設定・ネットワーク・HTTPエラー・不正レスポンス）
 */
export async function fetchServerModels(forceRefresh = false): Promise<{
  models: AIModel[];
  tier: string;
}> {
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(SERVER_MODELS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedServerModels;
        if (Date.now() - parsed.cachedAt < SERVER_MODELS_CACHE_TTL) {
          const models = (parsed.models ?? []).map((m) =>
            normalizeToAIModel(m as unknown as Record<string, unknown>),
          );
          const rawTier = parsed.tier as string;
          const cachedTier: string = rawTier === "pro" ? "pro" : "free";
          console.debug("[fetchServerModels] cache hit", {
            count: models.length,
            tier: cachedTier,
          });
          return { models, tier: cachedTier };
        }
      }
    } catch (e) {
      console.warn("[fetchServerModels] Cache read/parse failed, fetching from API", e);
    }
  }

  const apiBaseUrl = getAIAPIBaseUrl();
  console.debug("[fetchServerModels] fetching from API", {
    apiBaseUrl: apiBaseUrl || "(empty)",
    url: apiBaseUrl ? `${apiBaseUrl}/api/ai/models` : "(none)",
  });
  if (!apiBaseUrl) {
    const err = new FetchServerModelsError(
      "VITE_API_BASE_URL が設定されていません。.env に API サーバーの URL を設定してください。",
      "NO_BASE_URL",
    );
    console.error("[fetchServerModels]", err.message);
    throw err;
  }

  const result = await fetchModelsFromApi(apiBaseUrl);
  console.debug("[fetchServerModels] API response", {
    count: result.models.length,
    tier: result.tier,
  });

  try {
    localStorage.setItem(
      SERVER_MODELS_CACHE_KEY,
      JSON.stringify({
        models: result.models,
        tier: result.tier as UserTier,
        cachedAt: Date.now(),
      } satisfies CachedServerModels),
    );
  } catch {
    // ignore
  }

  return result;
}

/**
 * サーバーから現在の使用量を取得
 */
export async function fetchUsage(): Promise<AIUsage> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    return {
      usagePercent: 0,
      consumedUnits: 0,
      budgetUnits: 0,
      remaining: 0,
      tier: "free",
      yearMonth: "",
    };
  }

  const response = await fetch(`${apiBaseUrl}/api/ai/usage`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }

  if (!response.ok) {
    throw new Error("Failed to fetch usage");
  }

  return (await response.json()) as AIUsage;
}
