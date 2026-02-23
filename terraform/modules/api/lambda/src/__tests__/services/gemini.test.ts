import { describe, it, expect, vi, afterEach } from "vitest";
import { generateImageWithGemini } from "../../services/gemini";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gemini", () => {
  describe("generateImageWithGemini", () => {
    it("throws when prompt is missing", async () => {
      await expect(generateImageWithGemini("", "key")).rejects.toThrow(
        "Prompt and API key are required",
      );
    });

    it("throws when apiKey is missing", async () => {
      await expect(generateImageWithGemini("a cat", "")).rejects.toThrow(
        "Prompt and API key are required",
      );
    });

    it("returns data URI on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" },
                      },
                    ],
                  },
                },
              ],
            }),
        }),
      );

      const result = await generateImageWithGemini("a cat", "key");

      expect(result.imageUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
      expect(result.mimeType).toBe("image/png");
    });

    it("throws on API error response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal error"),
        }),
      );

      await expect(generateImageWithGemini("a cat", "key")).rejects.toThrow(
        "Gemini API failed: 500",
      );
    });

    it("throws when no image data in response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [] } }],
            }),
        }),
      );

      await expect(generateImageWithGemini("a cat", "key")).rejects.toThrow(
        "No image data in Gemini response",
      );
    });

    it("uses default model and aspect ratio when not specified", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: { mimeType: "image/png", data: "abc123" },
                    },
                  ],
                },
              },
            ],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await generateImageWithGemini("a dog", "key");

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("gemini-2.5-flash-image");

      const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.generationConfig.imageConfig.aspectRatio).toBe("16:9");
    });
  });
});
