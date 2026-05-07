/**
 * `commitThumbnailFromUrl` の応答ハンドリングをカバーするユニットテスト。
 * 401 → AuthRedirectError、413 → QuotaExceededError、それ以外の非OK → Error、
 * 成功時は imageUrl/objectId/provider を返すことを検証する。
 *
 * Unit tests for `commitThumbnailFromUrl` response handling: 401 maps to
 * AuthRedirectError, 413 (or `code: "STORAGE_QUOTA_EXCEEDED"`) maps to
 * QuotaExceededError, other non-OK responses surface as plain Error, and
 * success returns imageUrl/objectId/provider.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("@/i18n", () => ({
  default: { t: (key: string) => key },
}));

import { commitThumbnailFromUrl, AuthRedirectError, QuotaExceededError } from "./thumbnailCommit";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("commitThumbnailFromUrl", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("成功時に imageUrl/objectId/provider を返す / returns imageUrl, objectId, provider on success", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, {
        imageUrl: "https://cdn.example.com/foo.png",
        objectId: "obj-42",
        provider: "s3",
      }),
    );

    const result = await commitThumbnailFromUrl("https://src.example.com/img.png", {
      baseUrl: "https://api.example.com",
    });

    expect(result).toEqual({
      imageUrl: "https://cdn.example.com/foo.png",
      objectId: "obj-42",
      provider: "s3",
    });
  });

  it("401 で AuthRedirectError を投げる / throws AuthRedirectError on 401", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(401, { message: "no auth" }),
    );

    await expect(
      commitThumbnailFromUrl("https://src.example.com/img.png", {
        baseUrl: "https://api.example.com",
      }),
    ).rejects.toBeInstanceOf(AuthRedirectError);
  });

  it("413 で QuotaExceededError を投げ、サーバの message を保持する / throws QuotaExceededError carrying the server message on 413", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(413, {
        code: "STORAGE_QUOTA_EXCEEDED",
        message: "ストレージの容量制限に達しました。",
      }),
    );

    let caught: unknown;
    try {
      await commitThumbnailFromUrl("https://src.example.com/img.png", {
        baseUrl: "https://api.example.com",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(QuotaExceededError);
    expect((caught as Error).message).toBe("ストレージの容量制限に達しました。");
  });

  it("ステータスは 400 でも code が STORAGE_QUOTA_EXCEEDED なら QuotaExceededError / falls through to QuotaExceededError when code is set even with non-413 status", async () => {
    // 既存サーバの仕様変更（リライト等）に備えて code 由来でも判定する。
    // Defensive: also map by `code` so a future server tweak that returns a
    // different status still triggers the upgrade prompt instead of a generic
    // failure toast.
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(400, { code: "STORAGE_QUOTA_EXCEEDED", message: "out of space" }),
    );

    await expect(
      commitThumbnailFromUrl("https://src.example.com/img.png", {
        baseUrl: "https://api.example.com",
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("その他の非OK応答は Error にフォールバックする / falls back to Error on other non-OK statuses", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(502, { message: "upstream down" }),
    );

    let caught: unknown;
    try {
      await commitThumbnailFromUrl("https://src.example.com/img.png", {
        baseUrl: "https://api.example.com",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(QuotaExceededError);
    expect(caught).not.toBeInstanceOf(AuthRedirectError);
  });
});
