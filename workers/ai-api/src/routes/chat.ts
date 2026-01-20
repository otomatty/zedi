import { Hono } from "hono";
import type { Env } from "../types/env";
import type { AIChatRequest, AIProviderType } from "../types/api";
import { requireAuth, type AuthContext } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { createSSEStream } from "../utils/sse";
import {
  fetchAnthropic,
  fetchGoogle,
  fetchOpenAI,
  streamAnthropic,
  streamOpenAI,
} from "../services/aiProviders";

const route = new Hono<{ Bindings: Env; Variables: AuthContext }>();

route.use("/ai/*", requireAuth, rateLimit);

function isValidProvider(provider: string): provider is AIProviderType {
  return provider === "openai" || provider === "anthropic" || provider === "google";
}

route.post("/ai/chat", async (c) => {
  let body: AIChatRequest | null = null;
  try {
    body = await c.req.json();
  } catch {
    body = null;
  }

  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.provider || !isValidProvider(body.provider)) {
    return c.json({ error: "Invalid provider" }, 400);
  }

  if (!body.model || typeof body.model !== "string") {
    return c.json({ error: "Model is required" }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: "Messages are required" }, 400);
  }

  const request: AIChatRequest = {
    provider: body.provider,
    model: body.model,
    messages: body.messages,
    options: body.options,
  };

  if (request.options?.stream) {
    const stream = createSSEStream(async (writer) => {
      try {
        switch (request.provider) {
          case "openai":
            await streamOpenAI(c.env, request, writer, c.req.raw.signal);
            break;
          case "anthropic":
            await streamAnthropic(c.env, request, writer, c.req.raw.signal);
            break;
          case "google": {
            const response = await fetchGoogle(c.env, request);
            if (response.content) {
              writer.send({ content: response.content });
            }
            writer.send({
              done: true,
              finishReason: response.finishReason ?? "stop",
            });
            break;
          }
          default:
            throw new Error(`Unsupported provider: ${request.provider}`);
        }
      } catch (error) {
        writer.send({
          done: true,
          error: error instanceof Error ? error.message : "AI API error",
        });
      } finally {
        writer.close();
      }
    });

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    return c.body(stream);
  }

  try {
    switch (request.provider) {
      case "openai":
        return c.json(await fetchOpenAI(c.env, request));
      case "anthropic":
        return c.json(await fetchAnthropic(c.env, request));
      case "google":
        return c.json(await fetchGoogle(c.env, request));
      default:
        return c.json({ error: "Unsupported provider" }, 400);
    }
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "AI API error" },
      500
    );
  }
});

export default route;
