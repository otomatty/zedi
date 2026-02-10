/**
 * Chat route handlers — streaming and non-streaming
 */

import type {
  AIChatRequest,
  AIChatResponse,
  AIProviderType,
  EnvConfig,
  SSEPayload,
  TokenUsage,
} from "../types/index.js";
import { getAISecrets, getRequiredSecret } from "../lib/secrets.js";
import {
  checkUsage,
  recordUsage,
  validateModelAccess,
} from "../services/usageService.js";
import {
  fetchOpenAI,
  fetchAnthropic,
  fetchGoogle,
  streamOpenAI,
  streamAnthropic,
  streamGoogle,
} from "../services/aiProviders.js";
import { writeSSE } from "../utils/sse.js";

// =============================================================================
// Validation
// =============================================================================

function isValidProvider(p: string): p is AIProviderType {
  return p === "openai" || p === "anthropic" || p === "google";
}

function resolveModelId(provider: AIProviderType, model: string): string {
  // If already namespaced (e.g. "openai:gpt-4o"), return as-is
  if (model.includes(":")) return model;
  return `${provider}:${model}`;
}

function validateRequest(body: unknown): AIChatRequest {
  const req = body as AIChatRequest;
  if (!req.provider || !isValidProvider(req.provider)) {
    throw new Error("Invalid provider");
  }
  if (!req.model || typeof req.model !== "string") {
    throw new Error("Model is required");
  }
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    throw new Error("Messages are required");
  }
  return req;
}

// =============================================================================
// Provider API key resolution
// =============================================================================

async function getProviderKey(
  provider: AIProviderType,
  env: EnvConfig
): Promise<string> {
  const secrets = await getAISecrets(env.AI_SECRETS_ARN);
  switch (provider) {
    case "openai":
      return getRequiredSecret(secrets, "OPENAI_API_KEY");
    case "anthropic":
      return getRequiredSecret(secrets, "ANTHROPIC_API_KEY");
    case "google":
      return getRequiredSecret(secrets, "GOOGLE_AI_API_KEY");
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// =============================================================================
// Non-streaming chat handler
// =============================================================================

export async function handleChat(
  userId: string,
  body: unknown,
  env: EnvConfig
): Promise<AIChatResponse> {
  const request = validateRequest(body);
  const modelId = resolveModelId(request.provider, request.model);

  // Validate model access (tier check)
  await validateModelAccess(userId, modelId, env);

  // Check usage budget
  const usageCheck = await checkUsage(userId, env);
  if (!usageCheck.allowed) {
    throw new Error("USAGE_LIMIT_EXCEEDED");
  }

  // Get provider API key
  const apiKey = await getProviderKey(request.provider, env);

  // Call provider
  let result: AIChatResponse & { tokenUsage: TokenUsage };
  switch (request.provider) {
    case "openai":
      result = await fetchOpenAI(apiKey, request);
      break;
    case "anthropic":
      result = await fetchAnthropic(apiKey, request);
      break;
    case "google":
      result = await fetchGoogle(apiKey, request);
      break;
    default:
      throw new Error(`Unsupported provider: ${request.provider}`);
  }

  // Record usage
  const feature = request.options?.feature ?? "chat";
  const usageResult = await recordUsage(
    {
      userId,
      modelId,
      feature,
      tokenUsage: result.tokenUsage,
      apiMode: "system",
    },
    env
  );

  return {
    content: result.content,
    finishReason: result.finishReason,
    usage: {
      inputTokens: result.tokenUsage.inputTokens,
      outputTokens: result.tokenUsage.outputTokens,
      costUnits: usageResult.costUnits,
      usagePercent: usageResult.usagePercent,
    },
  };
}

// =============================================================================
// Streaming chat handler
// =============================================================================

export async function handleChatStreaming(
  userId: string,
  body: unknown,
  env: EnvConfig,
  stream: NodeJS.WritableStream
): Promise<void> {
  try {
    const request = validateRequest(body);
    const modelId = resolveModelId(request.provider, request.model);

    // Validate model access (tier check)
    await validateModelAccess(userId, modelId, env);

    // Check usage budget
    const usageCheck = await checkUsage(userId, env);
    if (!usageCheck.allowed) {
      writeSSE(stream, { error: "Usage limit exceeded", done: true });
      stream.end();
      return;
    }

    // Get provider API key
    const apiKey = await getProviderKey(request.provider, env);

    // Write function that forwards SSE to client
    const writeFn = (payload: SSEPayload) => writeSSE(stream, payload);

    // Call provider with streaming
    let tokenUsage: TokenUsage;
    switch (request.provider) {
      case "openai":
        tokenUsage = await streamOpenAI(apiKey, request, stream, writeFn);
        break;
      case "anthropic":
        tokenUsage = await streamAnthropic(apiKey, request, stream, writeFn);
        break;
      case "google":
        tokenUsage = await streamGoogle(apiKey, request, stream, writeFn);
        break;
      default:
        throw new Error(`Unsupported provider: ${request.provider}`);
    }

    // Record usage (after streaming completes)
    const feature = request.options?.feature ?? "chat";
    const usageResult = await recordUsage(
      {
        userId,
        modelId,
        feature,
        tokenUsage,
        apiMode: "system",
      },
      env
    );

    // Send final usage info
    writeSSE(stream, {
      done: true,
      usage: {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        costUnits: usageResult.costUnits,
        usagePercent: usageResult.usagePercent,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI API error";
    writeSSE(stream, { error: message, done: true });
  } finally {
    stream.end();
  }
}
