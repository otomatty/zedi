import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchUserAiCredentialsStatus,
  upsertUserAiCredential,
  deleteUserAiCredential,
  type UserAiCredentialsStatus,
} from "./userAiCredentials";

/** ok レスポンスの最小モック。 */
function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

/** エラーレスポンスの最小モック。json が body を返す/throw するかを選べる。 */
function errorResponse(status: number, body: unknown, jsonThrows = false): Response {
  return {
    ok: false,
    status,
    json: jsonThrows
      ? vi.fn().mockRejectedValue(new Error("not json"))
      : vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("userAiCredentials", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("fetchUserAiCredentialsStatus", () => {
    it("GET /api/user/ai-credentials を credentials:include で呼び、JSON を返す", async () => {
      const status: UserAiCredentialsStatus = {
        storageEnabled: true,
        providers: [{ provider: "openai", configured: true }],
      };
      fetchMock.mockResolvedValue(okResponse(status));

      const result = await fetchUserAiCredentialsStatus();

      expect(result).toEqual(status);
      expect(fetchMock).toHaveBeenCalledWith("/api/user/ai-credentials", {
        credentials: "include",
      });
    });

    it("エラー時は body.message を優先して throw する", async () => {
      fetchMock.mockResolvedValue(errorResponse(403, { message: "forbidden" }));

      await expect(fetchUserAiCredentialsStatus()).rejects.toThrow("forbidden");
    });

    it("body に message がない場合は hint + status を throw する", async () => {
      fetchMock.mockResolvedValue(errorResponse(500, {}));

      await expect(fetchUserAiCredentialsStatus()).rejects.toThrow(
        "fetchUserAiCredentialsStatus failed: 500",
      );
    });

    it("body.message が文字列でない場合は hint + status を throw する", async () => {
      fetchMock.mockResolvedValue(errorResponse(500, { message: 123 }));

      await expect(fetchUserAiCredentialsStatus()).rejects.toThrow(
        "fetchUserAiCredentialsStatus failed: 500",
      );
    });

    it("エラー body が JSON でない場合も hint + status を throw する", async () => {
      fetchMock.mockResolvedValue(errorResponse(502, null, true));

      await expect(fetchUserAiCredentialsStatus()).rejects.toThrow(
        "fetchUserAiCredentialsStatus failed: 502",
      );
    });
  });

  describe("upsertUserAiCredential", () => {
    it("PUT で apiKey を JSON body として送る", async () => {
      fetchMock.mockResolvedValue(okResponse({ ok: true }));

      await upsertUserAiCredential("anthropic", "secret-key");

      expect(fetchMock).toHaveBeenCalledWith("/api/user/ai-credentials/anthropic", {
        credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "secret-key" }),
      });
    });

    it("エラー時は body.message を優先して throw する", async () => {
      fetchMock.mockResolvedValue(errorResponse(400, { message: "bad key" }));

      await expect(upsertUserAiCredential("openai", "x")).rejects.toThrow("bad key");
    });

    it("body に message がない場合は hint + status を throw する", async () => {
      fetchMock.mockResolvedValue(errorResponse(400, {}));

      await expect(upsertUserAiCredential("openai", "x")).rejects.toThrow(
        "upsertUserAiCredential failed: 400",
      );
    });
  });

  describe("deleteUserAiCredential", () => {
    it("DELETE をプロバイダー別パスで呼ぶ", async () => {
      fetchMock.mockResolvedValue(okResponse({ ok: true }));

      await deleteUserAiCredential("google");

      expect(fetchMock).toHaveBeenCalledWith("/api/user/ai-credentials/google", {
        credentials: "include",
        method: "DELETE",
      });
    });

    it("エラー時は body.message を優先して throw する", async () => {
      fetchMock.mockResolvedValue(errorResponse(404, { message: "not found" }));

      await expect(deleteUserAiCredential("google")).rejects.toThrow("not found");
    });

    it("body に message がない場合は hint + status を throw する", async () => {
      fetchMock.mockResolvedValue(errorResponse(404, {}));

      await expect(deleteUserAiCredential("google")).rejects.toThrow(
        "deleteUserAiCredential failed: 404",
      );
    });
  });
});
