/**
 * AI サービス — API サーバー経由の呼び出し（SSE ストリーミング）。
 * AI service — API server calls via SSE streaming.
 */

import type { AIResponseUsage } from "@/types/ai";
import type { AIServiceRequest, AIServiceCallbacks, AIServiceResponse } from "./aiService";

/** Uses same base URL as REST API (VITE_API_BASE_URL). */
const getAIAPIBaseUrl = () => (import.meta.env.VITE_API_BASE_URL as string) ?? "";

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
      const ssePayload = line.slice(5).trim();
      if (!ssePayload) {
        newlineIndex = buffer.indexOf("\n");
        continue;
      }
      if (processSSEDataLine(ssePayload, state, callbacks)) {
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
 * API サーバー経由の呼び出し / Call via API server
 */
export async function callAIWithServer(
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
