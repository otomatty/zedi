import { describe, it, expect, beforeEach, vi } from "vitest";
import { GyazoProvider } from "./GyazoProvider";

function createTestFile(): File {
  return new File(["pixel"], "test.png", { type: "image/png" });
}

describe("GyazoProvider", () => {
  let provider: GyazoProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    provider = new GyazoProvider("test-access-token");
  });

  it("throws when accessToken is empty", () => {
    expect(() => new GyazoProvider("")).toThrow("Gyazo Access Token is required");
  });

  describe("uploadImage", () => {
    it("returns URL on success", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            image_id: "img-1",
            permalink_url: "https://gyazo.com/abc",
            thumb_url: "https://thumb.gyazo.com/abc",
            url: "https://i.gyazo.com/abc.png",
            type: "png",
          }),
          { status: 200 },
        ),
      );

      const url = await provider.uploadImage(createTestFile());
      expect(url).toBe("https://i.gyazo.com/abc.png");
    });

    it("throws on non-OK response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Unauthorized", { status: 401 }),
      );

      await expect(provider.uploadImage(createTestFile())).rejects.toThrow(
        /Gyazo upload failed: 401/,
      );
    });

    it("throws when no URL returned", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ image_id: "img-1", url: "" }), { status: 200 }),
      );

      await expect(provider.uploadImage(createTestFile())).rejects.toThrow(
        "Gyazo upload failed: No URL returned",
      );
    });
  });

  describe("testConnection", () => {
    it("returns success result", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            image_id: "img-1",
            url: "https://i.gyazo.com/test.png",
          }),
          { status: 200 },
        ),
      );

      const result = await provider.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toContain("接続成功");
    });

    it("returns failure on error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });
});
