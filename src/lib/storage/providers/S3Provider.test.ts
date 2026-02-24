import { describe, it, expect, beforeEach, vi } from "vitest";
import { S3Provider, type S3ProviderContext } from "./S3Provider";

function createTestFile(): File {
  return new File(["pixel"], "test.png", { type: "image/png" });
}

describe("S3Provider", () => {
  let getToken: ReturnType<typeof vi.fn>;
  let provider: S3Provider;

  beforeEach(() => {
    vi.restoreAllMocks();
    getToken = vi.fn().mockResolvedValue("test-jwt-token");
    const ctx: S3ProviderContext = {
      getToken: getToken as unknown as () => Promise<string | null>,
      baseUrl: "https://api.example.com",
    };
    provider = new S3Provider({}, ctx);
  });

  describe("uploadImage", () => {
    it("successfully uploads via 3-step flow", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            upload_url: "https://s3.example.com/presigned",
            media_id: "media-123",
            s3_key: "uploads/media-123.png",
          }),
          { status: 200 },
        ),
      );

      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const url = await provider.uploadImage(createTestFile());

      expect(fetchSpy).toHaveBeenCalledTimes(3);

      const [presignedUrl, presignedInit] = fetchSpy.mock.calls[0];
      expect(presignedUrl).toBe("https://api.example.com/api/media/upload");
      expect(presignedInit?.method).toBe("POST");

      const [putUrl, putInit] = fetchSpy.mock.calls[1];
      expect(putUrl).toBe("https://s3.example.com/presigned");
      expect(putInit?.method).toBe("PUT");

      const [confirmUrl] = fetchSpy.mock.calls[2];
      expect(confirmUrl).toBe("https://api.example.com/api/media/confirm");

      expect(url).toBe("https://api.example.com/api/media/media-123");
    });

    it("throws when not authenticated (getToken returns null)", async () => {
      getToken.mockResolvedValue(null);

      await expect(provider.uploadImage(createTestFile())).rejects.toThrow(/ログインしていません/);
    });

    it("throws on presigned URL failure", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("error", { status: 500 }));

      await expect(provider.uploadImage(createTestFile())).rejects.toThrow(
        /アップロード準備に失敗しました/,
      );
    });

    it("throws on S3 PUT failure", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            upload_url: "https://s3.example.com/presigned",
            media_id: "media-123",
            s3_key: "uploads/media-123.png",
          }),
          { status: 200 },
        ),
      );

      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 403 }));

      await expect(provider.uploadImage(createTestFile())).rejects.toThrow(
        /アップロードに失敗しました/,
      );
    });
  });

  describe("testConnection", () => {
    it("returns success on successful upload", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            upload_url: "https://s3.example.com/presigned",
            media_id: "media-test",
            s3_key: "uploads/media-test.png",
          }),
          { status: 200 },
        ),
      );
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });

    it("returns failure when not authenticated", async () => {
      getToken.mockResolvedValue(null);

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain("ログインしていません");
    });
  });
});
