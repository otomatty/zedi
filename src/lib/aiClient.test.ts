import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
      const raw = localStorage.getItem(CACHE_KEY);
      expect(raw).toBeTruthy();
      const stored = JSON.parse(raw ?? "{}");
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

  describe("createAIClient - claude-code", () => {
    it("throws because Claude Code does not use a traditional client", () => {
      expect(() =>
        createAIClient({
          provider: "claude-code",
          apiKey: "",
          model: "",
          modelId: "",
          isConfigured: true,
        }),
      ).toThrow(/Claude Code/);
    });
  });

  describe("getCachedModels - corrupt cache", () => {
    it("returns null when cache JSON is malformed", () => {
      localStorage.setItem(CACHE_KEY, "not json");
      expect(getCachedModels("openai")).toBeNull();
    });

    it("returns null when provider is missing from cache", () => {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ google: { provider: "google", models: [], cachedAt: Date.now() } }),
      );
      expect(getCachedModels("openai")).toBeNull();
    });
  });

  describe("saveCachedModels - merging", () => {
    it("does not overwrite other providers in cache", () => {
      const initial = {
        anthropic: { provider: "anthropic", models: ["claude-x"], cachedAt: 1 },
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(initial));
      saveCachedModels("openai", ["gpt-5"]);
      const stored = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
      expect(stored.anthropic.models).toEqual(["claude-x"]);
      expect(stored.openai.models).toEqual(["gpt-5"]);
    });

    it("壊れた既存キャッシュがあっても落ちず、生データは上書きしない / does not crash or overwrite when existing cache JSON is corrupt", () => {
      localStorage.setItem(CACHE_KEY, "{not json");
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      saveCachedModels("openai", ["gpt-5"]);
      // parse 失敗をログに残す。`getCachedModels` 経由では null が返るが、
      // 生の localStorage は壊れたまま放置される（saveCachedModels は catch して終わるため）。
      // The parse failure is logged. `getCachedModels` returns null afterward,
      // but the raw localStorage value stays untouched (saveCachedModels exits in the catch).
      expect(errSpy).toHaveBeenCalled();
      expect(localStorage.getItem(CACHE_KEY)).toBe("{not json");
    });
  });

  describe("getAvailableModels - empty cache", () => {
    it("falls back to defaults when cache exists but list is empty", () => {
      const cache = {
        openai: { provider: "openai", models: [], cachedAt: Date.now() },
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      const models = getAvailableModels("openai");
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain("gpt-5-mini");
    });
  });

  describe("testConnection - input validation", () => {
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

    it("returns Claude Code guidance when API key is empty (no API key required)", async () => {
      const result = await testConnection("claude-code", "");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Claude Code");
    });
  });

  describe("testConnection - openai", () => {
    it("returns success with sorted/filtered GPT models on success", async () => {
      const list = vi.fn().mockResolvedValue({
        data: [
          { id: "gpt-3.5-turbo" },
          { id: "gpt-4o" },
          { id: "gpt-4-vision-preview" }, // filtered out
          { id: "gpt-4-instruct" }, // filtered out
          { id: "gpt-4o-realtime" }, // filtered out
          { id: "gpt-4-audio" }, // filtered out
          { id: "text-embedding" }, // filtered out
          { id: "gpt-4-turbo" },
        ],
      });
      vi.mocked(OpenAI).mockImplementation(function (this: unknown) {
        return { models: { list } } as unknown as OpenAI;
      });

      const result = await testConnection("openai", "sk-test");
      expect(result.success).toBe(true);
      expect(result.models).toEqual(["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]);
      expect(result.message).toContain("3個");

      // キャッシュにも保存される
      const stored = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
      expect(stored.openai.models).toEqual(["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]);
    });

    it("falls back to default models when API returns no GPT models", async () => {
      vi.mocked(OpenAI).mockImplementation(function (this: unknown) {
        return {
          models: { list: vi.fn().mockResolvedValue({ data: [{ id: "dall-e-3" }] }) },
        } as unknown as OpenAI;
      });
      const result = await testConnection("openai", "sk-test");
      expect(result.success).toBe(true);
      expect(result.models).toContain("gpt-5-mini");
    });

    it("maps 401 error to APIキーが無効です", async () => {
      vi.mocked(OpenAI).mockImplementation(function (this: unknown) {
        return {
          models: { list: vi.fn().mockRejectedValue(new Error("401 Unauthorized")) },
        } as unknown as OpenAI;
      });
      const result = await testConnection("openai", "sk-test");
      expect(result.success).toBe(false);
      expect(result.message).toContain("APIキーが無効");
      expect(result.error).toContain("401");
    });

    it("maps invalid_api_key error to APIキーが無効です", async () => {
      vi.mocked(OpenAI).mockImplementation(function (this: unknown) {
        return {
          models: {
            list: vi.fn().mockRejectedValue(new Error("invalid_api_key")),
          },
        } as unknown as OpenAI;
      });
      const result = await testConnection("openai", "sk-test");
      expect(result.success).toBe(false);
      expect(result.message).toContain("APIキーが無効");
    });

    it("maps generic error to 接続に失敗しました", async () => {
      vi.mocked(OpenAI).mockImplementation(function (this: unknown) {
        return {
          models: { list: vi.fn().mockRejectedValue(new Error("network down")) },
        } as unknown as OpenAI;
      });
      const result = await testConnection("openai", "sk-test");
      expect(result.success).toBe(false);
      expect(result.message).toBe("接続に失敗しました");
      expect(result.error).toBe("network down");
    });

    it("uses 'Unknown error' when thrown value is not an Error", async () => {
      vi.mocked(OpenAI).mockImplementation(function (this: unknown) {
        return {
          models: { list: vi.fn().mockRejectedValue("string failure") },
        } as unknown as OpenAI;
      });
      const result = await testConnection("openai", "sk-test");
      expect(result.error).toBe("Unknown error");
    });
  });

  describe("testConnection - anthropic", () => {
    it("returns success and default models when ping succeeds", async () => {
      const create = vi.fn().mockResolvedValue({ id: "msg_123" });
      vi.mocked(Anthropic).mockImplementation(function (this: unknown) {
        return { messages: { create } } as unknown as Anthropic;
      });
      const result = await testConnection("anthropic", "sk-ant-x");
      expect(result.success).toBe(true);
      expect(result.models).toEqual(
        expect.arrayContaining(["claude-opus-4-6", "claude-sonnet-4-20250514"]),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-3-haiku-20240307",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        }),
      );
    });

    it("returns 予期しないレスポンス形式 when response has no id", async () => {
      vi.mocked(Anthropic).mockImplementation(function (this: unknown) {
        return {
          messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
        } as unknown as Anthropic;
      });
      const result = await testConnection("anthropic", "sk-ant-x");
      expect(result.success).toBe(false);
      expect(result.message).toContain("予期しないレスポンス");
    });

    it("maps authentication error to APIキーが無効です", async () => {
      vi.mocked(Anthropic).mockImplementation(function (this: unknown) {
        return {
          messages: {
            create: vi.fn().mockRejectedValue(new Error("authentication failed")),
          },
        } as unknown as Anthropic;
      });
      const result = await testConnection("anthropic", "sk-ant-x");
      expect(result.success).toBe(false);
      expect(result.message).toContain("APIキーが無効");
    });

    it("maps 401 error to APIキーが無効です", async () => {
      vi.mocked(Anthropic).mockImplementation(function (this: unknown) {
        return {
          messages: { create: vi.fn().mockRejectedValue(new Error("401")) },
        } as unknown as Anthropic;
      });
      const result = await testConnection("anthropic", "sk-ant-x");
      expect(result.success).toBe(false);
      expect(result.message).toContain("APIキーが無効");
    });

    it("maps generic error to 接続に失敗しました", async () => {
      vi.mocked(Anthropic).mockImplementation(function (this: unknown) {
        return {
          messages: { create: vi.fn().mockRejectedValue(new Error("boom")) },
        } as unknown as Anthropic;
      });
      const result = await testConnection("anthropic", "sk-ant-x");
      expect(result.success).toBe(false);
      expect(result.message).toBe("接続に失敗しました");
    });
  });

  describe("testConnection - google", () => {
    function mockFetch(impl: ReturnType<typeof vi.fn>): void {
      vi.stubGlobal("fetch", impl);
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("filters Gemini models, sorts by version, and caches", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                name: "models/gemini-1.5-flash",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/gemini-1.5-pro",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/gemini-2.0-flash",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/gemini-2.5-pro",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/text-bison",
                supportedGenerationMethods: ["generateContent"],
              }, // 除外
              {
                name: "models/gemini-embedding",
                supportedGenerationMethods: ["embedContent"],
              }, // 除外
            ],
          }),
          { status: 200 },
        ),
      );
      mockFetch(fetchSpy);

      const result = await testConnection("google", "AIza-x");
      expect(result.success).toBe(true);
      expect(result.models).toEqual([
        "gemini-2.5-pro",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
      ]);
      expect(result.message).toContain("4個");
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("AIza-x"));

      const stored = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
      expect(stored.google.models).toEqual(result.models);
    });

    it("returns default models when no Gemini models match", async () => {
      mockFetch(
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 })),
      );
      const result = await testConnection("google", "AIza-x");
      expect(result.success).toBe(true);
      // フォールバック先のデフォルトモデルを返す
      expect(result.models?.length ?? 0).toBeGreaterThan(0);
    });

    it("maps error containing 400 to APIキーが無効です", async () => {
      // 例: fetch reject の例外メッセージに 400 が含まれるケース。
      mockFetch(vi.fn().mockRejectedValue(new Error("HTTP 400 invalid key")));
      const result = await testConnection("google", "AIza-x");
      expect(result.success).toBe(false);
      expect(result.message).toContain("APIキーが無効");
    });

    it("maps API_KEY_INVALID error message to APIキーが無効です", async () => {
      mockFetch(vi.fn().mockRejectedValue(new Error("API_KEY_INVALID detail")));
      const result = await testConnection("google", "AIza-x");
      expect(result.success).toBe(false);
      expect(result.message).toContain("APIキーが無効");
    });

    it("maps generic error to 接続に失敗しました", async () => {
      mockFetch(
        vi
          .fn()
          .mockResolvedValue(new Response("oops", { status: 500, statusText: "Server Error" })),
      );
      const result = await testConnection("google", "AIza-x");
      expect(result.success).toBe(false);
      expect(result.message).toBe("接続に失敗しました");
    });
  });

  describe("testConnection - unknown provider", () => {
    it("returns failure with 不明なプロバイダー", async () => {
      const result = await testConnection("xxx" as never, "key");
      expect(result.success).toBe(false);
      expect(result.message).toContain("不明なプロバイダー");
    });
  });
});
