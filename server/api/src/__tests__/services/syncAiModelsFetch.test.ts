/**
 * syncAiModelsFetch の単体テスト。
 * `fetch` をモックし、各プロバイダーのモデル一覧取得について
 * 正常パース・フィルタ・異常レスポンス・タイムアウト・ページングを検証する。
 *
 * Unit tests for syncAiModelsFetch. `fetch` is mocked so each provider's model
 * listing is checked for happy-path mapping/filtering plus the failure modes:
 * non-OK responses, abort/timeout, invalid JSON, and pagination.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchAnthropicModels,
  fetchGoogleModels,
  fetchOpenAIModels,
  fetchWithTimeout,
} from "../../services/syncAiModelsFetch.js";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** OK JSON response stub. */
function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

/** Non-OK response stub returning a plain-text body. */
function errorRes(status: number, text: string) {
  return { ok: false, status, json: async () => ({}), text: async () => text };
}

/** OK text response stub (Anthropic reads `res.text()` first). */
function textRes(text: string) {
  return { ok: true, status: 200, text: async () => text };
}

describe("fetchWithTimeout", () => {
  it("成功時はそのまま Response を返し signal を付与する / returns the response and attaches an abort signal", async () => {
    const res = jsonRes({ ok: 1 });
    mockFetch.mockResolvedValue(res);

    const result = await fetchWithTimeout("https://example.com", { method: "GET" });

    expect(result).toBe(res);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com");
    expect(init.method).toBe("GET");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("AbortError はタイムアウトメッセージに変換する / converts an AbortError into a timeout message", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    mockFetch.mockRejectedValue(abort);

    await expect(fetchWithTimeout("https://slow.example")).rejects.toThrow(
      "Request timeout after 15000ms: https://slow.example",
    );
  });

  it("その他の fetch エラーはそのまま伝播する / propagates non-abort fetch errors unchanged", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(fetchWithTimeout("https://down.example")).rejects.toThrow("ECONNREFUSED");
  });
});

describe("fetchOpenAIModels", () => {
  it("gpt-/o1-/o3- 接頭辞のモデルだけを Row に整形する / keeps only gpt-/o1-/o3- models and maps them to rows", async () => {
    mockFetch.mockResolvedValue(
      jsonRes({
        data: [
          { id: "gpt-4o" },
          { id: "o1-preview" },
          { id: "text-embedding-3-small" },
          { id: "o3-mini" },
        ],
      }),
    );

    const rows = await fetchOpenAIModels("sk-openai");

    expect(rows).toEqual([
      {
        id: "openai:gpt-4o",
        provider: "openai",
        modelId: "gpt-4o",
        displayName: "gpt-4o",
        tierRequired: "pro",
        inputCostUnits: 1,
        outputCostUnits: 1,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: "openai:o1-preview",
        provider: "openai",
        modelId: "o1-preview",
        displayName: "o1-preview",
        tierRequired: "pro",
        inputCostUnits: 1,
        outputCostUnits: 1,
        isActive: true,
        sortOrder: 1,
      },
      {
        id: "openai:o3-mini",
        provider: "openai",
        modelId: "o3-mini",
        // "mini" を含むため free tier に割り当てられる。
        // Assigned to the free tier because the id contains "mini".
        tierRequired: "free",
        displayName: "o3-mini",
        inputCostUnits: 1,
        outputCostUnits: 1,
        isActive: true,
        sortOrder: 2,
      },
    ]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-openai");
  });

  it("非 OK レスポンスは status と body を含めて throw する / throws with status and body on a non-OK response", async () => {
    mockFetch.mockResolvedValue(errorRes(401, "invalid api key"));

    await expect(fetchOpenAIModels("sk-bad")).rejects.toThrow(
      "OpenAI models list failed: 401 invalid api key",
    );
  });

  it("data フィールドが無ければ空配列を返す / returns an empty array when data is absent", async () => {
    mockFetch.mockResolvedValue(jsonRes({}));

    expect(await fetchOpenAIModels("sk-openai")).toEqual([]);
  });
});

describe("fetchGoogleModels", () => {
  it("gemini / models/ を含むモデルだけ抽出し models/ 接頭辞を除去する / keeps gemini|models/ entries and strips the models/ prefix", async () => {
    mockFetch.mockResolvedValue(
      jsonRes({
        models: [
          { name: "models/gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
          { name: "models/embedding-001" },
          { name: "chat-bison" },
        ],
      }),
    );

    const rows = await fetchGoogleModels("g-key");

    expect(rows).toEqual([
      {
        id: "google:gemini-1.5-pro",
        provider: "google",
        modelId: "gemini-1.5-pro",
        displayName: "Gemini 1.5 Pro",
        // "pro" を含むため pro tier。
        // Contains "pro" → pro tier.
        tierRequired: "pro",
        inputCostUnits: 1,
        outputCostUnits: 1,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: "google:embedding-001",
        provider: "google",
        modelId: "embedding-001",
        // displayName が無ければ rawId をそのまま使う。
        // Falls back to rawId when displayName is missing.
        displayName: "embedding-001",
        tierRequired: "free",
        inputCostUnits: 1,
        outputCostUnits: 1,
        isActive: true,
        sortOrder: 1,
      },
    ]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
  });

  it("非 OK レスポンスは throw する / throws on a non-OK response", async () => {
    mockFetch.mockResolvedValue(errorRes(403, "forbidden"));

    await expect(fetchGoogleModels("g-key")).rejects.toThrow(
      "Google models list failed: 403 forbidden",
    );
  });

  it("models フィールドが無ければ空配列を返す / returns an empty array when models is absent", async () => {
    mockFetch.mockResolvedValue(jsonRes({}));

    expect(await fetchGoogleModels("g-key")).toEqual([]);
  });
});

describe("fetchAnthropicModels", () => {
  it("1 ページのモデルを Row に整形し debug を付けない / maps a single page and omits debug when rows exist", async () => {
    mockFetch.mockResolvedValue(
      textRes(
        JSON.stringify({
          data: [
            { id: "claude-3-5-sonnet", display_name: "Claude 3.5 Sonnet" },
            { id: "claude-3-haiku" },
          ],
          has_more: false,
        }),
      ),
    );

    const result = await fetchAnthropicModels("sk-anthropic");

    expect(result.debug).toBeUndefined();
    expect(result.rows).toEqual([
      {
        id: "anthropic:claude-3-5-sonnet",
        provider: "anthropic",
        modelId: "claude-3-5-sonnet",
        displayName: "Claude 3.5 Sonnet",
        tierRequired: "pro",
        inputCostUnits: 1,
        outputCostUnits: 1,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: "anthropic:claude-3-haiku",
        provider: "anthropic",
        modelId: "claude-3-haiku",
        // display_name 欠落時は id を表示名に使う。
        // Falls back to the id when display_name is missing.
        displayName: "claude-3-haiku",
        // "haiku" を含むため free tier。
        // Contains "haiku" → free tier.
        tierRequired: "free",
        inputCostUnits: 1,
        outputCostUnits: 1,
        isActive: true,
        sortOrder: 1,
      },
    ]);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("limit=100");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-anthropic");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("has_more に従ってページを辿り after_id を引き継ぐ / follows has_more across pages, carrying after_id", async () => {
    mockFetch
      .mockResolvedValueOnce(
        textRes(
          JSON.stringify({ data: [{ id: "claude-a" }], has_more: true, last_id: "cursor-1" }),
        ),
      )
      .mockResolvedValueOnce(
        textRes(JSON.stringify({ data: [{ id: "claude-b" }], has_more: false })),
      );

    const result = await fetchAnthropicModels("sk-anthropic");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.rows.map((r) => r.modelId)).toEqual(["claude-a", "claude-b"]);
    // sortOrder は全ページ通しの連番になる。
    // sortOrder is a continuous index across pages.
    expect(result.rows.map((r) => r.sortOrder)).toEqual([0, 1]);
    const secondUrl = mockFetch.mock.calls[1]?.[0] as string;
    expect(secondUrl).toContain("after_id=cursor-1");
  });

  it("非 OK レスポンスは throw する / throws on a non-OK response", async () => {
    mockFetch.mockResolvedValue(
      Object.assign(errorRes(429, "rate limited"), { text: async () => "rate limited" }),
    );

    await expect(fetchAnthropicModels("sk-anthropic")).rejects.toThrow(
      "Anthropic models list failed: 429 rate limited",
    );
  });

  it("壊れた JSON は invalid JSON エラーにする / surfaces an invalid-JSON error for non-JSON bodies", async () => {
    mockFetch.mockResolvedValue(textRes("<html>not json</html>"));

    await expect(fetchAnthropicModels("sk-anthropic")).rejects.toThrow(
      "Anthropic: invalid JSON response: <html>not json</html>",
    );
  });

  it("空の data はゼロ件 + デバッグ情報を返す / returns zero rows plus a debug sample for empty data", async () => {
    mockFetch.mockResolvedValue(textRes(JSON.stringify({ data: [], has_more: false })));

    const result = await fetchAnthropicModels("sk-anthropic");

    expect(result.rows).toEqual([]);
    expect(result.debug).toContain("pages=1");
    expect(result.debug).toContain("body_sample=");
  });

  it("has_more が止まらなくても 20 ページで打ち切る / stops paginating after 20 pages even if has_more never clears", async () => {
    // has_more を永遠に true で返しても、暴走防止で 21 リクエストで打ち切る。
    // A runaway `has_more: true` is capped so we never loop unbounded.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch.mockResolvedValue(
      textRes(JSON.stringify({ data: [{ id: "claude-x" }], has_more: true, last_id: "c" })),
    );

    const result = await fetchAnthropicModels("sk-anthropic");

    expect(mockFetch).toHaveBeenCalledTimes(21);
    expect(result.rows).toHaveLength(21);
    expect(warnSpy).toHaveBeenCalledWith(
      "[syncAiModels] Anthropic fetch stopped after 20 pages. More models may exist.",
    );
    warnSpy.mockRestore();
  });
});
