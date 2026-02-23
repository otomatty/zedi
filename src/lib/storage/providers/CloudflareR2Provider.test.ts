import { describe, it, expect, beforeEach, vi } from "vitest";
import { CloudflareR2Provider } from "./CloudflareR2Provider";

const VALID_CONFIG = {
  bucket: "my-bucket",
  accountId: "acct-123",
  accessKeyId: "AKID",
  secretAccessKey: "secret",
};

function createTestFile(): File {
  return new File(["pixel"], "test.png", { type: "image/png" });
}

describe("CloudflareR2Provider", () => {
  let provider: CloudflareR2Provider;

  beforeEach(() => {
    vi.restoreAllMocks();
    provider = new CloudflareR2Provider(VALID_CONFIG);
  });

  it("throws on incomplete config", () => {
    expect(
      () => new CloudflareR2Provider({ ...VALID_CONFIG, bucket: "" })
    ).toThrow("Cloudflare R2 configuration is incomplete");

    expect(
      () => new CloudflareR2Provider({ ...VALID_CONFIG, accountId: "" })
    ).toThrow("Cloudflare R2 configuration is incomplete");

    expect(
      () => new CloudflareR2Provider({ ...VALID_CONFIG, accessKeyId: "" })
    ).toThrow("Cloudflare R2 configuration is incomplete");

    expect(
      () => new CloudflareR2Provider({ ...VALID_CONFIG, secretAccessKey: "" })
    ).toThrow("Cloudflare R2 configuration is incomplete");
  });

  describe("uploadImage", () => {
    it("constructs correct URL and returns public URL", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 200 })
      );

      const url = await provider.uploadImage(createTestFile());

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [reqUrl, reqInit] = fetchSpy.mock.calls[0];
      expect(reqUrl).toContain("acct-123.r2.cloudflarestorage.com");
      expect(reqUrl).toContain("my-bucket");
      expect(reqInit?.method).toBe("PUT");

      expect(url).toContain("my-bucket");
      expect(url).toContain("acct-123");
    });

    it("uses publicUrl when provided", async () => {
      const providerWithPublicUrl = new CloudflareR2Provider({
        ...VALID_CONFIG,
        publicUrl: "https://cdn.example.com",
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 200 })
      );

      const url = await providerWithPublicUrl.uploadImage(createTestFile());
      expect(url).toMatch(/^https:\/\/cdn\.example\.com\//);
    });

    it("throws on non-OK response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Forbidden", { status: 403 })
      );

      await expect(provider.uploadImage(createTestFile())).rejects.toThrow(
        /Cloudflare R2 upload failed: 403/
      );
    });
  });

  describe("testConnection", () => {
    it("returns success on OK response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 200 })
      );

      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });

    it("returns success on 404 response (empty bucket)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 404 })
      );

      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });

    it("returns failure on error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("Network error")
      );

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });
});
