import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleDriveProvider } from "./GoogleDriveProvider";

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "",
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

const file = new File([new Uint8Array([1, 2, 3])], "src.png", { type: "image/png" });

describe("GoogleDriveProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("constructor", () => {
    it("clientId が無い場合は throw する", () => {
      expect(() => new GoogleDriveProvider({ ...config, clientId: "" })).toThrow(
        "Google Drive configuration is incomplete",
      );
    });

    it("accessToken が無い場合は throw する", () => {
      expect(() => new GoogleDriveProvider({ ...config, accessToken: "" })).toThrow(
        "Google Drive configuration is incomplete",
      );
    });

    it("name は 'Google Drive'", () => {
      expect(new GoogleDriveProvider(config).name).toBe("Google Drive");
    });
  });

  describe("uploadImage", () => {
    it("multipart アップロード後にファイルを公開し、表示用 URL を返す", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: "file-1" })) // upload
        .mockResolvedValueOnce(jsonResponse({})); // makeFilePublic
      const provider = new GoogleDriveProvider(config);

      const url = await provider.uploadImage(file, { fileName: "pic.png" });

      expect(url).toBe("https://drive.google.com/uc?export=view&id=file-1");
      const [uploadUrl, uploadOpts] = fetchMock.mock.calls[0];
      expect(uploadUrl).toContain("uploadType=multipart");
      expect(uploadOpts.headers.Authorization).toBe("Bearer access-token");
      expect(uploadOpts.body).toContain('"name":"pic.png"');
      // 2回目は permissions エンドポイント
      expect(fetchMock.mock.calls[1][0]).toContain("/permissions");
    });

    it("folderId が指定されると metadata.parents に反映される", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: "file-2" }))
        .mockResolvedValueOnce(jsonResponse({}));
      const provider = new GoogleDriveProvider({ ...config, folderId: "folder-123" });

      await provider.uploadImage(file, { fileName: "pic.png" });

      expect(fetchMock.mock.calls[0][1].body).toContain('"parents":["folder-123"]');
    });

    it("401 のときはトークンをリフレッシュして新トークンで再試行する", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 })) // upload -> 401
        .mockResolvedValueOnce(jsonResponse({ access_token: "new-token" })) // refresh
        .mockResolvedValueOnce(jsonResponse({ id: "file-3" })) // retry upload
        .mockResolvedValueOnce(jsonResponse({})); // makeFilePublic
      const provider = new GoogleDriveProvider(config);

      const url = await provider.uploadImage(file, { fileName: "pic.png" });

      expect(url).toBe("https://drive.google.com/uc?export=view&id=file-3");
      expect(fetchMock).toHaveBeenCalledTimes(4);
      // リフレッシュ後の再試行は新トークンを使う
      expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer new-token");
    });

    it("リフレッシュトークンが無く 401 の場合はエラーを throw する", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { message: "invalid" } }, { ok: false, status: 401 }),
      );
      const provider = new GoogleDriveProvider({ ...config, refreshToken: "" });

      await expect(provider.uploadImage(file, { fileName: "pic.png" })).rejects.toThrow(
        "Google Drive upload failed: 401 invalid",
      );
    });

    it("エラー body に message が無い場合は statusText にフォールバックする", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({}, { ok: false, status: 500, statusText: "Server Error" }),
      );
      const provider = new GoogleDriveProvider({ ...config, refreshToken: "" });

      await expect(provider.uploadImage(file, { fileName: "pic.png" })).rejects.toThrow(
        "Google Drive upload failed: 500 Server Error",
      );
    });

    it("中断済み signal では AbortError を投げ、fetch しない", async () => {
      const controller = new AbortController();
      controller.abort();
      const provider = new GoogleDriveProvider(config);

      await expect(
        provider.uploadImage(file, { fileName: "pic.png", signal: controller.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("deleteImage", () => {
    it("URL に id が無い場合は throw する", async () => {
      const provider = new GoogleDriveProvider(config);

      await expect(provider.deleteImage("https://drive.google.com/x")).rejects.toThrow(
        "Invalid Google Drive image URL",
      );
    });

    it("id を抽出して DELETE を送る", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));
      const provider = new GoogleDriveProvider(config);

      await provider.deleteImage("https://drive.google.com/uc?export=view&id=file-9");

      const [delUrl, delOpts] = fetchMock.mock.calls[0];
      expect(delUrl).toBe("https://www.googleapis.com/drive/v3/files/file-9");
      expect(delOpts.method).toBe("DELETE");
    });

    it("404 は成功扱いで throw しない", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));
      const provider = new GoogleDriveProvider(config);

      await expect(
        provider.deleteImage("https://drive.google.com/uc?id=file-9"),
      ).resolves.toBeUndefined();
    });

    it("404 以外のエラーは throw する", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
      const provider = new GoogleDriveProvider(config);

      await expect(provider.deleteImage("https://drive.google.com/uc?id=file-9")).rejects.toThrow(
        "Failed to delete file: 500",
      );
    });
  });

  describe("testConnection", () => {
    it("ok ならユーザーのメールアドレス入りで成功を返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ user: { emailAddress: "me@example.com" } }));
      const provider = new GoogleDriveProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain("me@example.com");
    });

    it("401 かつ refreshToken ありでリフレッシュ成功なら成功を返す", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 }))
        .mockResolvedValueOnce(jsonResponse({ access_token: "new-token" }));
      const provider = new GoogleDriveProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain("トークンを更新");
    });

    it("401 かつリフレッシュ失敗なら失敗を返す", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 }))
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 400 }));
      const provider = new GoogleDriveProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain("認証の更新に失敗");
    });

    it("401 かつ refreshToken 無しなら再認証エラーを返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
      const provider = new GoogleDriveProvider({ ...config, refreshToken: "" });

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain("認証に失敗");
    });

    it("その他の HTTP エラーは status を返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));
      const provider = new GoogleDriveProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 503");
    });
  });

  describe("static helpers", () => {
    it("getAuthUrl は必要なパラメータを含む", () => {
      const url = GoogleDriveProvider.getAuthUrl("cid", "https://app/cb");

      expect(url).toContain("client_id=cid");
      expect(url).toContain("redirect_uri=https%3A%2F%2Fapp%2Fcb");
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
    });

    it("exchangeCodeForTokens は成功時にトークンを返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: "at", refresh_token: "rt" }));

      const tokens = await GoogleDriveProvider.exchangeCodeForTokens(
        "code",
        "cid",
        "secret",
        "https://app/cb",
      );

      expect(tokens).toEqual({ accessToken: "at", refreshToken: "rt" });
    });

    it("exchangeCodeForTokens は失敗時に throw する", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 400 }));

      await expect(
        GoogleDriveProvider.exchangeCodeForTokens("code", "cid", "secret", "https://app/cb"),
      ).rejects.toThrow("Failed to exchange code for tokens");
    });
  });
});
