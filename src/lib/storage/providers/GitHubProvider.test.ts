import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubProvider } from "./GitHubProvider";

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

const config = { repository: "owner/repo", token: "ghp_token" };

describe("GitHubProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("constructor", () => {
    it("repository が無い場合は throw する", () => {
      expect(() => new GitHubProvider({ repository: "", token: "t" })).toThrow(
        "GitHub configuration is incomplete",
      );
    });

    it("token が無い場合は throw する", () => {
      expect(() => new GitHubProvider({ repository: "owner/repo", token: "" })).toThrow(
        "GitHub configuration is incomplete",
      );
    });

    it("name は 'GitHub'", () => {
      expect(new GitHubProvider(config).name).toBe("GitHub");
    });
  });

  describe("uploadImage", () => {
    const file = new File(["hello"], "src.png", { type: "image/png" });

    it("Contents API に PUT し、raw.githubusercontent の URL を返す（デフォルト branch/path）", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ content: { sha: "abc" } }));
      const provider = new GitHubProvider(config);

      const url = await provider.uploadImage(file, { fileName: "pic.png" });

      expect(url).toBe("https://raw.githubusercontent.com/owner/repo/main/images/pic.png");
      const [calledUrl, opts] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe("https://api.github.com/repos/owner/repo/contents/images/pic.png");
      expect(opts.method).toBe("PUT");
      expect(opts.headers.Authorization).toBe("Bearer ghp_token");
      const body = JSON.parse(opts.body);
      expect(body).toMatchObject({ message: "Upload image: pic.png", branch: "main" });
      expect(typeof body.content).toBe("string");
    });

    it("branch / path / folder オプションが URL と body に反映される", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));
      const provider = new GitHubProvider({ ...config, branch: "dev", path: "assets" });

      const url = await provider.uploadImage(file, { fileName: "pic.png", folder: "sub" });

      expect(url).toBe("https://raw.githubusercontent.com/owner/repo/dev/sub/pic.png");
      const [calledUrl, opts] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe("https://api.github.com/repos/owner/repo/contents/sub/pic.png");
      expect(JSON.parse(opts.body).branch).toBe("dev");
    });

    it("既に中断済みの signal では AbortError を投げ、fetch しない", async () => {
      const controller = new AbortController();
      controller.abort();
      const provider = new GitHubProvider(config);

      await expect(
        provider.uploadImage(file, { fileName: "pic.png", signal: controller.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("レスポンスが ok でない場合は status と message を含めて throw する", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ message: "bad credentials" }, { ok: false, status: 401 }),
      );
      const provider = new GitHubProvider(config);

      await expect(provider.uploadImage(file, { fileName: "pic.png" })).rejects.toThrow(
        "GitHub upload failed: 401 bad credentials",
      );
    });

    it("エラー body に message が無い場合は statusText にフォールバックする", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({}, { ok: false, status: 500, statusText: "Server Error" }),
      );
      const provider = new GitHubProvider(config);

      await expect(provider.uploadImage(file, { fileName: "pic.png" })).rejects.toThrow(
        "GitHub upload failed: 500 Server Error",
      );
    });
  });

  describe("deleteImage", () => {
    const validUrl = "https://raw.githubusercontent.com/owner/repo/main/images/pic.png";

    it("URL が不正な場合は throw する", async () => {
      const provider = new GitHubProvider(config);

      await expect(provider.deleteImage("https://example.com/x.png")).rejects.toThrow(
        "Invalid GitHub image URL",
      );
    });

    it("sha を取得してから DELETE を送る", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ sha: "sha123" })) // GET file info
        .mockResolvedValueOnce(jsonResponse({})); // DELETE
      const provider = new GitHubProvider(config);

      await provider.deleteImage(validUrl);

      const [getUrl] = fetchMock.mock.calls[0];
      expect(getUrl).toBe(
        "https://api.github.com/repos/owner/repo/contents/images/pic.png?ref=main",
      );
      const [delUrl, delOpts] = fetchMock.mock.calls[1];
      expect(delUrl).toBe("https://api.github.com/repos/owner/repo/contents/images/pic.png");
      expect(delOpts.method).toBe("DELETE");
      expect(JSON.parse(delOpts.body).sha).toBe("sha123");
    });

    it("ファイル情報の取得に失敗したら throw する", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 }));
      const provider = new GitHubProvider(config);

      await expect(provider.deleteImage(validUrl)).rejects.toThrow("Failed to get file info: 404");
    });

    it("削除リクエストが失敗したら throw する", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ sha: "sha123" }))
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 403 }));
      const provider = new GitHubProvider(config);

      await expect(provider.deleteImage(validUrl)).rejects.toThrow("Failed to delete file: 403");
    });
  });

  describe("testConnection", () => {
    it("push 権限ありなら成功を返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ permissions: { push: true } }));
      const provider = new GitHubProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain("owner/repo");
    });

    it("push 権限が無い場合は失敗を返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ permissions: { push: false } }));
      const provider = new GitHubProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe("書き込み権限がありません");
    });

    it("401 は認証エラーとして失敗を返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
      const provider = new GitHubProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain("認証に失敗");
    });

    it("404 はリポジトリ未検出として失敗を返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));
      const provider = new GitHubProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain("リポジトリが見つかりません");
    });

    it("その他の HTTP エラーは status を返す", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
      const provider = new GitHubProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 500");
    });

    it("fetch が throw した場合も失敗を返す", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const provider = new GitHubProvider(config);

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe("network down");
    });
  });
});
