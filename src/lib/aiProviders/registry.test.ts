import { describe, it, expect } from "vitest";
import { AI_PROVIDERS, API_ONLY_PROVIDERS, getProviderById } from "@/types/ai";
import { checkAllProviderAvailability, createProvider, getVisibleProviders } from "./registry";

describe("AI Provider types (Issue #457)", () => {
  it("offers the three direct-API providers and nothing desktop-only", () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual(["google", "openai", "anthropic"]);
    expect(getProviderById("claude-code" as never)).toBeUndefined();
    expect(API_ONLY_PROVIDERS).toEqual(AI_PROVIDERS);
  });

  it("gives every provider text generation and web search", () => {
    for (const provider of AI_PROVIDERS) {
      expect(provider.capabilities).toEqual({ textGeneration: true, webSearch: true });
    }
  });
});

describe("Provider registry (Issue #457)", () => {
  it("shows every provider in settings", () => {
    expect(getVisibleProviders()).toEqual(AI_PROVIDERS);
  });

  it("createProvider returns provider for openai", () => {
    const provider = createProvider({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-5",
      modelId: "openai:gpt-5",
      isConfigured: true,
    });
    expect(provider.id).toBe("openai");
    expect(provider.capabilities.textGeneration).toBe(true);
  });

  it("treats every provider as available through the Zedi server", async () => {
    const results = await checkAllProviderAvailability({
      provider: "google",
      apiKey: "",
      apiMode: "api_server",
      model: "gemini-3-flash-preview",
      modelId: "google:gemini-3-flash-preview",
      isConfigured: false,
    });

    expect(results.every((r) => r.available && r.reason === undefined)).toBe(true);
  });

  it("needs an API key in own-key mode", async () => {
    const results = await checkAllProviderAvailability({
      provider: "openai",
      apiKey: " ",
      apiMode: "user_api_key",
      model: "gpt-5",
      modelId: "openai:gpt-5",
      isConfigured: false,
    });

    expect(results.map((r) => r.available)).toEqual([false, false, false]);
    expect(results[0]?.reason).toBe("API キーが未設定 / API key not configured");
  });
});
