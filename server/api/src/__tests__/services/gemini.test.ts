/**
 * gemini.ts のテスト（Google Generative Language API ラッパー）。
 * Tests for the Gemini image-generation wrapper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateImageWithGemini } from "../../services/gemini.js";

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  fetchSpy.mockReset();
});

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generateImageWithGemini", () => {
  it("throws when prompt is empty", async () => {
    await expect(generateImageWithGemini("", "key")).rejects.toThrow(
      /prompt and api key are required/i,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when apiKey is empty", async () => {
    await expect(generateImageWithGemini("a prompt", "")).rejects.toThrow(
      /prompt and api key are required/i,
    );
  });

  it("returns a base64 data URI on success", async () => {
    fetchSpy.mockResolvedValue(
      ok({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: "AAA" } }],
            },
          },
        ],
      }),
    );

    const result = await generateImageWithGemini("a cat", "test-key");

    expect(result).toEqual({
      imageUrl: "data:image/png;base64,AAA",
      mimeType: "image/png",
    });

    // URL とヘッダの確認。
    // Verify the URL and required headers were sent.
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/models/gemini-2.5-flash-image:generateContent");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    // body にプロンプトと aspectRatio が含まれる（デフォルト 16:9）。
    // Body must include the prompt and the default aspectRatio.
    const body = JSON.parse(String((init as RequestInit).body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: { imageConfig: { aspectRatio: string } };
    };
    expect(body.contents[0]?.parts[0]?.text).toBe("a cat");
    expect(body.generationConfig.imageConfig.aspectRatio).toBe("16:9");
  });

  it("respects custom aspectRatio and model from options", async () => {
    fetchSpy.mockResolvedValue(
      ok({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/jpeg", data: "BBB" } }],
            },
          },
        ],
      }),
    );

    await generateImageWithGemini("p", "key", { model: "gemini-2.0-flash", aspectRatio: "1:1" });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/models/gemini-2.0-flash:generateContent");
    const body = JSON.parse(String((init as RequestInit).body)) as {
      generationConfig: { imageConfig: { aspectRatio: string } };
    };
    expect(body.generationConfig.imageConfig.aspectRatio).toBe("1:1");
  });

  it("throws when API responds with non-200", async () => {
    fetchSpy.mockResolvedValue(
      new Response("rate limited", {
        status: 429,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(generateImageWithGemini("p", "k")).rejects.toThrow(/429/);
  });

  it("throws when the response carries an `error` payload", async () => {
    fetchSpy.mockResolvedValue(ok({ error: { code: 400, message: "bad prompt" } }));

    await expect(generateImageWithGemini("p", "k")).rejects.toThrow(/bad prompt/);
  });

  it("throws when no candidate content/parts are returned", async () => {
    fetchSpy.mockResolvedValue(ok({ candidates: [{ content: { parts: [] } }] }));

    await expect(generateImageWithGemini("p", "k")).rejects.toThrow(/no image data/i);
  });

  it("throws when no inlineData part is present", async () => {
    fetchSpy.mockResolvedValue(
      ok({
        candidates: [
          { content: { parts: [{ inlineData: { data: "x" } /* missing mimeType */ }] } },
        ],
      }),
    );

    await expect(generateImageWithGemini("p", "k")).rejects.toThrow(/no image data/i);
  });
});
