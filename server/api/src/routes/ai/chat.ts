import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { getUserTier } from "../../services/subscriptionService.js";
import { checkUsage, calculateCost, recordUsage } from "../../services/usageService.js";
import { resolveModelAccessWithFallback } from "../../services/modelResolverService.js";
import { callProvider, streamProvider, getProviderApiKeyName } from "../../services/aiProviders.js";
import type { AppEnv, AIChatRequest, SSEPayload, AIProviderType } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.post("/", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<AIChatRequest>();

  if (!body.provider || !body.model || !body.messages?.length) {
    throw new HTTPException(400, { message: "provider, model, and messages are required" });
  }

  const tier = await getUserTier(userId, db);
  let modelInfo;
  try {
    modelInfo = await resolveModelAccessWithFallback(body.model, tier, db);
  } catch {
    throw new HTTPException(503, { message: "No available model for tier" });
  }
  const usageCheck = await checkUsage(userId, tier, db);
  if (!usageCheck.allowed) {
    throw new HTTPException(429, { message: "Monthly budget exceeded" });
  }

  const apiKeyName = getProviderApiKeyName(modelInfo.provider as AIProviderType);
  const apiKey = process.env[apiKeyName];
  if (!apiKey) {
    throw new HTTPException(503, { message: `API key not configured: ${apiKeyName}` });
  }

  const feature = body.options?.feature ?? "chat";
  const isStreaming = body.options?.stream ?? false;

  if (isStreaming) {
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

            await recordUsage(
              userId,
              modelInfo.modelId,
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
  await recordUsage(userId, modelInfo.modelId, feature, result.usage, costUnits, "system", db);
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
