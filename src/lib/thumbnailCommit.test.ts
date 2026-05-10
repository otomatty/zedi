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

import {
  commitThumbnailFromUrl,
  deleteCommittedThumbnail,
  AuthRedirectError,
  QuotaExceededError,
} from "./thumbnailCommit";

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

describe("deleteCommittedThumbnail", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("DELETE /api/thumbnail/serve/:id を所有者 cookie 付きで叩く / issues a credentialed DELETE to /api/thumbnail/serve/:id", async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await deleteCommittedThumbnail("obj-1", { baseUrl: "https://api.example.com" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/api/thumbnail/serve/obj-1");
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("include");
  });

  it("ネットワーク失敗を飲み込んで throw しない / swallows network failures (rollback is best-effort)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    await expect(
      deleteCommittedThumbnail("obj-2", { baseUrl: "https://api.example.com" }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("非OK レスポンス (500/429/403 等) は warn でログを残す / warns on unexpected non-OK rollback responses", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response(null, { status: 500, statusText: "Server Error" }));

    await deleteCommittedThumbnail("obj-500", { baseUrl: "https://api.example.com" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0];
    expect(args.some((arg) => arg === 500)).toBe(true);
    expect(args.some((arg) => arg === "obj-500")).toBe(true);
  });

  it("401/404/409 は no-op として warn しない / treats 401/404/409 as expected no-ops (no warn)", async () => {
    // 409 は issue #820 の参照ガードが「ライブページが参照中なので消さない」
    // と判定したケース。phantom rollback としてはむしろ望ましい結果なので
    // ログは残さない。
    //
    // 409 is the issue #820 referential-guard response: a live page still
    // references this thumbnail and the server preserved it. That is the
    // intended outcome when our rollback fired phantom-style after a
    // successful page commit, so we suppress the warning.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await deleteCommittedThumbnail("obj-401", { baseUrl: "https://api.example.com" });

    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await deleteCommittedThumbnail("obj-404", { baseUrl: "https://api.example.com" });

    mockFetch.mockResolvedValueOnce(new Response(null, { status: 409 }));
    await deleteCommittedThumbnail("obj-409", { baseUrl: "https://api.example.com" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("baseUrl/objectId のいずれかが空なら fetch しない / no-ops when baseUrl or objectId is empty", async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    await deleteCommittedThumbnail("", { baseUrl: "https://api.example.com" });
    await deleteCommittedThumbnail("obj-3", { baseUrl: "" });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("objectId に特殊文字が含まれていても URL エンコードされる / URL-encodes the objectId", async () => {
    const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await deleteCommittedThumbnail("ob/j+id?", { baseUrl: "https://api.example.com" });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.example.com/api/thumbnail/serve/ob%2Fj%2Bid%3F");
  });
});
