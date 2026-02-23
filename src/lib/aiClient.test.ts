import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createAIClient,
  getCachedModels,
  saveCachedModels,
  clearModelsCache,
  getAvailableModels,
  testConnection,
} from "./aiClient";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

vi.mock("openai", () => ({ default: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: vi.fn() }));

const CACHE_KEY = "zedi-ai-models-cache";

describe("aiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("createAIClient", () => {
    it("creates OpenAI client with correct config", () => {
      createAIClient({
        provider: "openai",
        apiKey: "sk-test",
        model: "gpt-5-mini",
        modelId: "openai:gpt-5-mini",
        isConfigured: true,
      });
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: "sk-test",
        dangerouslyAllowBrowser: true,
      });
    });

    it("creates Anthropic client", () => {
      createAIClient({
        provider: "anthropic",
        apiKey: "sk-ant-test",
        model: "claude-sonnet-4-20250514",
        modelId: "anthropic:claude-sonnet-4-20250514",
        isConfigured: true,
      });
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: "sk-ant-test" });
    });

    it("creates Google AI client", () => {
      createAIClient({
        provider: "google",
        apiKey: "AIza-test",
        model: "gemini-3-flash-preview",
        modelId: "google:gemini-3-flash-preview",
        isConfigured: true,
      });
      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "AIza-test" });
    });

    it("throws for unknown provider", () => {
      expect(() =>
        createAIClient({
          provider: "unknown" as never,
          apiKey: "key",
          model: "m",
          modelId: "m",
          isConfigured: true,
        }),
      ).toThrow("Unknown provider: unknown");
    });
  });

  describe("getCachedModels", () => {
    it("returns null when no cache exists", () => {
      expect(getCachedModels("openai")).toBeNull();
    });

    it("returns cached models within TTL", () => {
      const cache = {
        openai: {
          provider: "openai",
          models: ["gpt-5-mini", "gpt-5-nano"],
          cachedAt: Date.now(),
        },
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      expect(getCachedModels("openai")).toEqual(["gpt-5-mini", "gpt-5-nano"]);
    });

    it("returns null for expired cache", () => {
      const expired = Date.now() - 25 * 60 * 60 * 1000;
      const cache = {
        openai: { provider: "openai", models: ["gpt-5-mini"], cachedAt: expired },
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      expect(getCachedModels("openai")).toBeNull();
    });
  });

  describe("saveCachedModels", () => {
    it("saves models to localStorage", () => {
      saveCachedModels("openai", ["gpt-5-mini"]);
      const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!);
      expect(stored.openai.models).toEqual(["gpt-5-mini"]);
      expect(stored.openai.provider).toBe("openai");
      expect(stored.openai.cachedAt).toBeGreaterThan(0);
    });
  });

  describe("clearModelsCache", () => {
    it("removes cache from localStorage", () => {
      localStorage.setItem(CACHE_KEY, '{"openai":{}}');
      clearModelsCache();
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });
  });

  describe("getAvailableModels", () => {
    it("returns cached models when available", () => {
      const cache = {
        google: {
          provider: "google",
          models: ["gemini-custom-model"],
          cachedAt: Date.now(),
        },
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      expect(getAvailableModels("google")).toEqual(["gemini-custom-model"]);
    });

    it("returns default models when no cache exists", () => {
      const models = getAvailableModels("openai");
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain("gpt-5-mini");
    });
  });

  describe("testConnection", () => {
    it("returns failure for empty API key", async () => {
      const result = await testConnection("openai", "");
      expect(result.success).toBe(false);
      expect(result.message).toContain("APIキー");
    });

    it("returns failure for whitespace-only API key", async () => {
      const result = await testConnection("anthropic", "   ");
      expect(result.success).toBe(false);
      expect(result.message).toContain("APIキー");
    });
  });
});
