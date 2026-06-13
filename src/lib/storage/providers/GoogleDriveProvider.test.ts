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
      expect(uploadUrl).toBe(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
      );
      expect(uploadOpts.method).toBe("POST");
      expect(uploadOpts.headers.Authorization).toBe("Bearer access-token");
      expect(uploadOpts.headers["Content-Type"]).toBe(
        "multipart/related; boundary=zedi_upload_boundary",
      );
      // マルチパートボディの構造（区切り・Content-Type・base64・終端）
      const body = uploadOpts.body as string;
      expect(body).toContain("\r\n--zedi_upload_boundary\r\n");
      expect(body).toContain("Content-Type: application/json; charset=UTF-8");
      expect(body).toContain('"name":"pic.png"');
      expect(body).toContain('"mimeType":"image/png"');
      expect(body).toContain("Content-Type: image/png");
      expect(body).toContain("Content-Transfer-Encoding: base64");
      expect(body).toContain("AQID"); // btoa of bytes [1,2,3]
      expect(body.endsWith("\r\n--zedi_upload_boundary--")).toBe(true);

      // 2回目: ファイルを公開する permissions リクエスト
      const [permUrl, permOpts] = fetchMock.mock.calls[1];
      expect(permUrl).toBe("https://www.googleapis.com/drive/v3/files/file-1/permissions");
      expect(permOpts.method).toBe("POST");
      expect(permOpts.headers.Authorization).toBe("Bearer access-token");
      expect(permOpts.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(permOpts.body)).toEqual({ role: "reader", type: "anyone" });
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
      // 2回目: トークンリフレッシュのリクエスト内容
      const [refreshUrl, refreshOpts] = fetchMock.mock.calls[1];
      expect(refreshUrl).toBe("https://oauth2.googleapis.com/token");
      expect(refreshOpts.method).toBe("POST");
      const refreshBody = refreshOpts.body.toString();
      expect(refreshBody).toContain("grant_type=refresh_token");
      expect(refreshBody).toContain("client_id=client-id");
      expect(refreshBody).toContain("client_secret=client-secret");
      expect(refreshBody).toContain("refresh_token=refresh-token");
      // リフレッシュ後の再試行は新トークンを使う
      expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer new-token");
    });

    it("401 後のトークンリフレッシュに失敗した場合はエラーを throw する", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 })) // upload -> 401
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 400 })); // refresh fails
      const provider = new GoogleDriveProvider(config);

      await expect(provider.uploadImage(file, { fileName: "pic.png" })).rejects.toThrow(
        "Failed to refresh access token",
      );
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
      ).rejects.toMatchObject({ name: "AbortError", message: "Image upload aborted" });
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
      expect(delOpts.headers.Authorization).toBe("Bearer access-token");
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
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://www.googleapis.com/drive/v3/about?fields=user",
      );
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
    });

    it("ok だが user 情報が無い場合も成功を返す（optional chaining）", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));
      const provider = new GoogleDriveProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
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

      expect(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
      expect(url).toContain("client_id=cid");
      expect(url).toContain("redirect_uri=https%3A%2F%2Fapp%2Fcb");
      expect(url).toContain("response_type=code");
      expect(url).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file");
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
    });

    it("exchangeCodeForTokens は成功時にトークンを返し、正しい body を送る", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ access_token: "at", refresh_token: "rt" }));

      const tokens = await GoogleDriveProvider.exchangeCodeForTokens(
        "code",
        "cid",
        "secret",
        "https://app/cb",
      );

      expect(tokens).toEqual({ accessToken: "at", refreshToken: "rt" });
      const [tokenUrl, tokenOpts] = fetchMock.mock.calls[0];
      expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
      const tokenBody = tokenOpts.body.toString();
      expect(tokenBody).toContain("grant_type=authorization_code");
      expect(tokenBody).toContain("code=code");
      expect(tokenBody).toContain("client_id=cid");
      expect(tokenBody).toContain("redirect_uri=https%3A%2F%2Fapp%2Fcb");
    });

    it("exchangeCodeForTokens は失敗時に throw する", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 400 }));

      await expect(
        GoogleDriveProvider.exchangeCodeForTokens("code", "cid", "secret", "https://app/cb"),
      ).rejects.toThrow("Failed to exchange code for tokens");
    });
  });
});
