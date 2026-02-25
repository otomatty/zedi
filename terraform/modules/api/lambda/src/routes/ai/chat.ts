/**
 * POST /api/ai/chat — AI チャット (ストリーミング + 非ストリーミング)
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rateLimiter";
import { getEnvConfig } from "../../env";
import { getAISecrets, getRequired } from "../../lib/secrets";
import { getUserTier } from "../../services/subscriptionService";
import {
  checkUsage,
  validateModelAccess,
  calculateCost,
  recordUsage,
} from "../../services/usageService";
import { callProvider, streamProvider, getProviderApiKeyName } from "../../services/aiProviders";
import type { AppEnv, AIChatRequest, SSEPayload, AIProviderType } from "../../types";

const app = new Hono<AppEnv>();

app.post("/", authRequired, rateLimiter, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const env = getEnvConfig();

  const body = await c.req.json<AIChatRequest>();

  // バリデーション
  if (!body.provider || !body.model || !body.messages?.length) {
    throw new HTTPException(400, {
      message: "provider, model, and messages are required",
    });
  }

  // ユーザーのティアを取得
  const tier = await getUserTier(userId, db);

  // モデルアクセス検証
  const modelInfo = await validateModelAccess(body.model, tier, db);

  // 使用量チェック
  const usageCheck = await checkUsage(userId, tier, db);
  if (!usageCheck.allowed) {
    throw new HTTPException(429, { message: "Monthly budget exceeded" });
  }

  // API キー取得
  const secrets = await getAISecrets(env.AI_SECRETS_ARN);
  const apiKeyName = getProviderApiKeyName(body.provider);
  const apiKey = getRequired(secrets, apiKeyName as keyof typeof secrets);

  const feature = body.options?.feature ?? "chat";
  const isStreaming = body.options?.stream ?? false;

  if (isStreaming) {
    // ── ストリーミング応答 ──
    return streamSSE(c, async (stream) => {
      let totalContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const gen = streamProvider(
          modelInfo.provider as AIProviderType,
          apiKey,
          modelInfo.apiModelId,
          body.messages,
          body.options,
        );

        for await (const chunk of gen) {
          if (chunk.content) {
            totalContent += chunk.content;
            const payload: SSEPayload = { content: chunk.content };
            await stream.writeSSE({ data: JSON.stringify(payload) });
          }
          if (chunk.done) {
            // トークン数を推定 (ストリーミングではプロバイダーが返さない場合がある)
            inputTokens = Math.ceil(
              body.messages.reduce((sum, m) => sum + m.content.length, 0) / 4,
            );
            outputTokens = Math.ceil(totalContent.length / 4);

            const costUnits = calculateCost(
              { inputTokens, outputTokens },
              modelInfo.inputCostUnits,
              modelInfo.outputCostUnits,
            );

            const updatedUsage = await checkUsage(userId, tier, db);

            const donePayload: SSEPayload = {
              done: true,
              finishReason: chunk.finishReason,
              usage: {
                inputTokens,
                outputTokens,
                costUnits,
                usagePercent: updatedUsage.usagePercent,
              },
            };
            await stream.writeSSE({ data: JSON.stringify(donePayload) });

            // 使用量を記録
            await recordUsage(
              userId,
              body.model,
              feature,
              { inputTokens, outputTokens },
              costUnits,
              "system",
              db,
            );
          }
        }
      } catch (err) {
        const errorPayload: SSEPayload = {
          error: err instanceof Error ? err.message : "Stream error",
          done: true,
        };
        await stream.writeSSE({ data: JSON.stringify(errorPayload) });
      }
    });
  }

  // ── 非ストリーミング応答 ──
  const result = await callProvider(
    modelInfo.provider as AIProviderType,
    apiKey,
    modelInfo.apiModelId,
    body.messages,
    body.options,
  );

  const costUnits = calculateCost(
    result.usage,
    modelInfo.inputCostUnits,
    modelInfo.outputCostUnits,
  );

  // 使用量を記録
  await recordUsage(userId, body.model, feature, result.usage, costUnits, "system", db);

  const updatedUsage = await checkUsage(userId, tier, db);

  return c.json({
    content: result.content,
    finishReason: result.finishReason,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUnits,
      usagePercent: updatedUsage.usagePercent,
    },
  });
});

export default app;
