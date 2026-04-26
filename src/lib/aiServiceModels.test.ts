/**
 * Tests for AI service model listing & usage helpers.
 * AI サービスのモデル一覧／使用量取得のテスト。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FetchServerModelsError, fetchServerModels, fetchUsage } from "./aiServiceModels";
import type { AIModel, AIUsage, UserTier } from "@/types/ai";

const SERVER_MODELS_CACHE_KEY = "zedi-ai-server-models";
const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Build a fully-populated AIModel for cache fixtures.
 * キャッシュ用のテストモデルを生成する。
 */
function buildModel(overrides: Partial<AIModel> = {}): AIModel {
  return {
    id: "openai:gpt-5",
    provider: "openai",
    modelId: "gpt-5",
    displayName: "GPT-5",
    tierRequired: "free",
    available: true,
    inputCostUnits: 1,
    outputCostUnits: 2,
    ...overrides,
  };
}

describe("aiServiceModels", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    // Suppress noisy console output triggered by error paths.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("FetchServerModelsError", () => {
    it("正しい name と code を保持する", () => {
      const err = new FetchServerModelsError("boom", "NETWORK", { status: 500 });
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("FetchServerModelsError");
      expect(err.message).toBe("boom");
      expect(err.code).toBe("NETWORK");
      expect(err.details).toEqual({ status: 500 });
    });

    it("details は省略可能", () => {
      const err = new FetchServerModelsError("x", "HTTP");
      expect(err.details).toBeUndefined();
    });
  });

  describe("fetchServerModels - cache hit", () => {
    it("TTL 内のキャッシュをそのまま返し、API を呼ばない", async () => {
      const cached = {
        models: [buildModel({ id: "openai:gpt-5", modelId: "gpt-5" })],
        tier: "pro" as UserTier,
        cachedAt: Date.now(),
      };
      localStorage.setItem(SERVER_MODELS_CACHE_KEY, JSON.stringify(cached));

      const result = await fetchServerModels();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.tier).toBe("pro");
      expect(result.models).toHaveLength(1);
      expect(result.models[0].id).toBe("openai:gpt-5");
    });

    it("snake_case のキャッシュも camelCase へ正規化する", async () => {
      // キャッシュが古いフォーマット (snake_case) で書かれていた場合の互換性。
      const rawCache = {
        models: [
          {
            id: "openai:gpt-5",
            provider: "openai",
            model_id: "gpt-5",
            display_name: "GPT-5",
            tier_required: "pro",
            available: true,
            input_cost_units: 5,
            output_cost_units: 6,
          },
        ],
        tier: "pro",
        cachedAt: Date.now(),
      };
      localStorage.setItem(SERVER_MODELS_CACHE_KEY, JSON.stringify(rawCache));

      const result = await fetchServerModels();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.models[0]).toEqual({
        id: "openai:gpt-5",
        provider: "openai",
        modelId: "gpt-5",
        displayName: "GPT-5",
        tierRequired: "pro",
        available: true,
        inputCostUnits: 5,
        outputCostUnits: 6,
      });
      expect(result.tier).toBe("pro");
    });

    it("キャッシュの tier が pro 以外の値なら free にフォールバック", async () => {
      const cached = {
        models: [],
        tier: "enterprise",
        cachedAt: Date.now(),
      };
      localStorage.setItem(SERVER_MODELS_CACHE_KEY, JSON.stringify(cached));

      const result = await fetchServerModels();
      expect(result.tier).toBe("free");
    });

    it("TTL を過ぎたキャッシュは無視して API を叩く", async () => {
      const cached = {
        models: [buildModel({ id: "old:model" })],
        tier: "free" as UserTier,
        cachedAt: Date.now() - (TEN_MINUTES_MS + 1),
      };
      localStorage.setItem(SERVER_MODELS_CACHE_KEY, JSON.stringify(cached));

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ models: [], tier: "free" }), { status: 200 }),
      );

      const result = await fetchServerModels();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.models).toEqual([]);
    });

    it("forceRefresh=true なら有効なキャッシュも無視する", async () => {
      const cached = {
        models: [buildModel({ id: "openai:cached", modelId: "cached" })],
        tier: "pro" as UserTier,
        cachedAt: Date.now(),
      };
      localStorage.setItem(SERVER_MODELS_CACHE_KEY, JSON.stringify(cached));

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ models: [], tier: "free" }), { status: 200 }),
      );

      const result = await fetchServerModels(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.tier).toBe("free");
    });

    it("不正な JSON のキャッシュは無視して API を叩く", async () => {
      localStorage.setItem(SERVER_MODELS_CACHE_KEY, "{not valid json");
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ models: [], tier: "free" }), { status: 200 }),
      );

      await fetchServerModels();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchServerModels - API success", () => {
    it("API レスポンスを正規化して返し、キャッシュへ保存する", async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                id: "openai:gpt-5",
                provider: "openai",
                model_id: "gpt-5",
                display_name: "GPT-5",
                tier_required: "pro",
                available: true,
                input_cost_units: 1,
                output_cost_units: 2,
              },
              {
                id: "google:gemini",
                provider: "google",
                modelId: "gemini-3-flash",
                displayName: "Gemini 3 Flash",
                tierRequired: "free",
                available: false,
                inputCostUnits: 0.5,
                outputCostUnits: 1.5,
              },
            ],
            tier: "pro",
          }),
          { status: 200 },
        ),
      );

      const result = await fetchServerModels();

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/ai/models",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        }),
      );
      expect(result.tier).toBe("pro");
      expect(result.models).toHaveLength(2);
      expect(result.models[0].modelId).toBe("gpt-5");
      expect(result.models[0].tierRequired).toBe("pro");
      expect(result.models[1].modelId).toBe("gemini-3-flash");
      expect(result.models[1].tierRequired).toBe("free");

      const stored = localStorage.getItem(SERVER_MODELS_CACHE_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored ?? "{}");
      expect(parsed.tier).toBe("pro");
      expect(parsed.models).toHaveLength(2);
      expect(typeof parsed.cachedAt).toBe("number");
    });

    it("不正なプロバイダー文字列は google にフォールバックする", async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                id: "x:y",
                provider: "weird-provider",
                model_id: "x",
                display_name: "X",
              },
            ],
            tier: "free",
          }),
          { status: 200 },
        ),
      );

      const result = await fetchServerModels();
      expect(result.models[0].provider).toBe("google");
    });

    it("欠損フィールドはデフォルト値で埋める", async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [{}],
            tier: "free",
          }),
          { status: 200 },
        ),
      );

      const result = await fetchServerModels();
      expect(result.models[0]).toEqual({
        id: "",
        provider: "google",
        modelId: "",
        displayName: "",
        tierRequired: "free",
        available: false,
        inputCostUnits: 0,
        outputCostUnits: 0,
      });
    });

    it("非有限数 (±Infinity) の cost は 0 に正規化する / non-finite cost values fall back to 0", async () => {
      // `JSON.stringify(Infinity)` は `null` になり Number.isFinite ガードを通らないため、
      // 生 JSON リテラル `1e1000` で `JSON.parse` に実際の Infinity を作らせる。
      // (NaN は JSON 表現不可能だが、Number.isFinite ガードは符号無関係に同じ分岐へ落ちる。)
      // We avoid `JSON.stringify(Infinity)` (which collapses to `null` and would only
      // exercise the missing-field path). A raw `1e1000` literal yields an actual
      // Infinity from `JSON.parse`, so this test really exercises the
      // `Number.isFinite` guard in `toNum`.
      const rawBody =
        '{"models":[{"id":"x:y","provider":"openai","model_id":"x",' +
        '"display_name":"X","input_cost_units":1e1000,"output_cost_units":-1e1000}],' +
        '"tier":"free"}';
      fetchSpy.mockResolvedValue(new Response(rawBody, { status: 200 }));

      const result = await fetchServerModels();
      expect(result.models[0].inputCostUnits).toBe(0);
      expect(result.models[0].outputCostUnits).toBe(0);
    });

    it("tier が不明なら free にフォールバックする", async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ models: [], tier: "unknown" }), { status: 200 }),
      );

      const result = await fetchServerModels();
      expect(result.tier).toBe("free");
    });

    it("localStorage の setItem が失敗しても結果は返す", async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ models: [], tier: "free" }), { status: 200 }),
      );
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });

      await expect(fetchServerModels()).resolves.toEqual({ models: [], tier: "free" });
      expect(setItemSpy).toHaveBeenCalled();
    });
  });

  describe("fetchServerModels - error paths", () => {
    it("VITE_API_BASE_URL 未設定なら NO_BASE_URL を投げる", async () => {
      vi.stubEnv("VITE_API_BASE_URL", "");
      await expect(fetchServerModels()).rejects.toMatchObject({
        name: "FetchServerModelsError",
        code: "NO_BASE_URL",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fetch が TypeError(fetch) ならネットワークエラーメッセージにする", async () => {
      fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
      try {
        await fetchServerModels();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FetchServerModelsError);
        const e = err as FetchServerModelsError;
        expect(e.code).toBe("NETWORK");
        expect(e.message).toContain("ネットワークエラー");
      }
    });

    it("fetch が一般的な Error ならリクエスト失敗メッセージにする", async () => {
      fetchSpy.mockRejectedValue(new Error("DNS failure"));
      try {
        await fetchServerModels();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FetchServerModelsError);
        const e = err as FetchServerModelsError;
        expect(e.code).toBe("NETWORK");
        expect(e.message).toContain("リクエスト失敗");
        expect(e.message).toContain("DNS failure");
      }
    });

    it("fetch が非 Error 値を投げてもラップする", async () => {
      fetchSpy.mockRejectedValue("plain string failure");
      await expect(fetchServerModels()).rejects.toMatchObject({
        code: "NETWORK",
      });
    });

    it("HTTP エラーは status / statusText / 抜粋 body を保持する", async () => {
      const longBody = "x".repeat(1000);
      fetchSpy.mockResolvedValue(
        new Response(longBody, { status: 503, statusText: "Service Unavailable" }),
      );

      try {
        await fetchServerModels();
        expect.fail("should have thrown");
      } catch (err) {
        const e = err as FetchServerModelsError;
        expect(e.code).toBe("HTTP");
        expect(e.details?.status).toBe(503);
        expect(e.details?.statusText).toBe("Service Unavailable");
        expect(e.details?.body?.length).toBe(500);
      }
    });

    it("レスポンスが JSON でなければ INVALID_RESPONSE", async () => {
      fetchSpy.mockResolvedValue(new Response("not json at all", { status: 200 }));
      try {
        await fetchServerModels();
        expect.fail("should have thrown");
      } catch (err) {
        const e = err as FetchServerModelsError;
        expect(e.code).toBe("INVALID_RESPONSE");
      }
    });

    it("models フィールドが配列でなければ INVALID_RESPONSE", async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ models: "oops", tier: "free" }), { status: 200 }),
      );
      try {
        await fetchServerModels();
        expect.fail("should have thrown");
      } catch (err) {
        const e = err as FetchServerModelsError;
        expect(e.code).toBe("INVALID_RESPONSE");
      }
    });

    it("response.text() が失敗したら NETWORK エラーへ変換する", async () => {
      const badResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        text: vi.fn().mockRejectedValue(new Error("read failed")),
      };
      fetchSpy.mockResolvedValue(badResponse as unknown as Response);

      try {
        await fetchServerModels();
        expect.fail("should have thrown");
      } catch (err) {
        const e = err as FetchServerModelsError;
        expect(e.code).toBe("NETWORK");
        expect(e.message).toContain("レスポンスの読み取り");
      }
    });
  });

  describe("fetchUsage", () => {
    function buildUsage(overrides: Partial<AIUsage> = {}): AIUsage {
      return {
        usagePercent: 12.5,
        consumedUnits: 100,
        budgetUnits: 800,
        remaining: 700,
        tier: "free",
        yearMonth: "2026-04",
        ...overrides,
      };
    }

    it("ベース URL 未設定なら空の使用量オブジェクトを返す", async () => {
      vi.stubEnv("VITE_API_BASE_URL", "");
      const usage = await fetchUsage();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(usage).toEqual({
        usagePercent: 0,
        consumedUnits: 0,
        budgetUnits: 0,
        remaining: 0,
        tier: "free",
        yearMonth: "",
      });
    });

    it("正常レスポンスをそのまま返す", async () => {
      const expected = buildUsage({ tier: "pro", yearMonth: "2026-04" });
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(expected), { status: 200 }));

      const usage = await fetchUsage();
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/ai/usage",
        expect.objectContaining({ method: "GET", credentials: "include" }),
      );
      expect(usage).toEqual(expected);
    });

    it("401 なら AUTH_REQUIRED を投げる", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 401 }));
      await expect(fetchUsage()).rejects.toThrow("AUTH_REQUIRED");
    });

    it("その他の HTTP エラーは Failed to fetch usage を投げる", async () => {
      fetchSpy.mockResolvedValue(new Response("", { status: 500 }));
      await expect(fetchUsage()).rejects.toThrow("Failed to fetch usage");
    });

    it("レスポンスが usage 形式でなければ INVALID_USAGE_RESPONSE を投げる", async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ tier: "free" }), { status: 200 }));
      await expect(fetchUsage()).rejects.toThrow("INVALID_USAGE_RESPONSE");
    });

    it("tier が不正な値なら INVALID_USAGE_RESPONSE を投げる", async () => {
      const invalid = { ...buildUsage(), tier: "enterprise" };
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(invalid), { status: 200 }));
      await expect(fetchUsage()).rejects.toThrow("INVALID_USAGE_RESPONSE");
    });

    it("数値フィールドが欠落していたら INVALID_USAGE_RESPONSE を投げる", async () => {
      const invalid = { ...buildUsage(), usagePercent: undefined };
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(invalid), { status: 200 }));
      await expect(fetchUsage()).rejects.toThrow("INVALID_USAGE_RESPONSE");
    });

    it("payload が null なら INVALID_USAGE_RESPONSE を投げる", async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(null), { status: 200 }));
      await expect(fetchUsage()).rejects.toThrow("INVALID_USAGE_RESPONSE");
    });
  });
});
