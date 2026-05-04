/**
 * `githubAppAuth` の単体テスト (Epic #616 Phase 2 / sub-issue #805)。
 *
 * - `readDispatchRepository`: env 解析（owner/repo, 未設定, 不正値）
 * - `getInstallationToken`: モック fetch 越しのキャッシュ挙動
 * - `triggerRepositoryDispatch`: 設定欠落時のエラーと正常時のリクエスト形状
 * - `verifyInstallationToken`: GET /installation 経由の id 比較
 *
 * Unit tests for `githubAppAuth`. Network calls are mocked by stubbing the
 * global `fetch`, and the in-module token cache is reset between tests via
 * the exported `__resetInstallationTokenCacheForTests` helper so each test
 * starts from a deterministic state. The JWT-signing path (`createAppJWT`)
 * is mocked at the `jose` boundary so the test suite does not need to ship
 * a real RSA private key (which would trip secret-scanners like gitleaks).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// `jose` の RS256 署名は実鍵を要求するが、テストでは JWT の中身も署名検証も
// しないので、`importPKCS8` / `SignJWT` ともに固定の文字列を返すモックに置き換える。
// これによりテスト用の PEM をリポジトリに置く必要がなくなり、gitleaks 等の
// 秘密情報スキャナでの誤検知も避けられる。
//
// Mock `jose` at the boundary so JWT minting becomes deterministic without a
// real private key. The tests don't actually verify the signature; they only
// care that the install-token fetch happens with `Bearer <something>`. Avoiding
// a real PEM also keeps gitleaks/secret-scanners quiet on this test file.
vi.mock("jose", () => {
  // `new SignJWT()` を `new` で呼ぶので、コンストラクタ可能なクラスを返す。
  // vi.fn().mockImplementation(...) は constructor として動かないため、
  // 素のクラスにフルチェーンの no-op メソッドを生やす。
  // `SignJWT` is invoked with `new`, so we expose a real constructible class.
  // `vi.fn().mockImplementation(...)` is not constructible in vitest, so we
  // hand-roll the chainable no-op surface that `createAppJWT` walks through.
  class MockSignJWT {
    setProtectedHeader(): this {
      return this;
    }
    setIssuedAt(): this {
      return this;
    }
    setIssuer(): this {
      return this;
    }
    setExpirationTime(): this {
      return this;
    }
    async sign(): Promise<string> {
      return "mock.app.jwt";
    }
  }
  return {
    importPKCS8: async () => "mock-key" as unknown,
    SignJWT: MockSignJWT,
  };
});

import {
  __resetInstallationTokenCacheForTests,
  getInstallationToken,
  readDispatchRepository,
  triggerRepositoryDispatch,
  verifyInstallationToken,
} from "./githubAppAuth.js";

describe("readDispatchRepository", () => {
  const ORIGINAL = process.env.GITHUB_DISPATCH_REPOSITORY;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.GITHUB_DISPATCH_REPOSITORY;
    else process.env.GITHUB_DISPATCH_REPOSITORY = ORIGINAL;
  });

  it("returns null when env is unset", () => {
    delete process.env.GITHUB_DISPATCH_REPOSITORY;
    expect(readDispatchRepository()).toBeNull();
  });

  it("returns null when env is empty / blank", () => {
    process.env.GITHUB_DISPATCH_REPOSITORY = "   ";
    expect(readDispatchRepository()).toBeNull();
  });

  it("returns null when the value is not in owner/repo form", () => {
    process.env.GITHUB_DISPATCH_REPOSITORY = "owner-only";
    expect(readDispatchRepository()).toBeNull();
  });

  it("parses owner/repo into structured form", () => {
    process.env.GITHUB_DISPATCH_REPOSITORY = "otomatty/zedi";
    expect(readDispatchRepository()).toEqual({ owner: "otomatty", repo: "zedi" });
  });
});

describe("getInstallationToken / triggerRepositoryDispatch", () => {
  beforeEach(() => {
    __resetInstallationTokenCacheForTests();
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_INSTALLATION_ID = "67890";
    // 実鍵は不要 — `jose` をモック済みなので任意の文字列で OK。
    // No real key needed; `jose` is mocked above so any non-empty string passes.
    process.env.GITHUB_APP_PRIVATE_KEY = "mocked-not-a-real-key";
  });

  afterEach(() => {
    __resetInstallationTokenCacheForTests();
    vi.unstubAllGlobals();
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_DISPATCH_REPOSITORY;
  });

  it("fetches an installation token and caches it across calls", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            token: "ghs_install_token_abc",
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const t1 = await getInstallationToken();
    const t2 = await getInstallationToken();
    expect(t1).toBe("ghs_install_token_abc");
    expect(t2).toBe(t1);
    // キャッシュ済み: 2 回呼んでもネットワーク往復は 1 回だけ。
    // Cached: only one network call, despite two callers.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when GitHub returns non-2xx", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getInstallationToken()).rejects.toThrow(/401/);
  });

  it("throws when GitHub response body is missing token / expires_at", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getInstallationToken()).rejects.toThrow(/missing token/i);
  });

  it("triggerRepositoryDispatch throws when GITHUB_DISPATCH_REPOSITORY is unset and no override given", async () => {
    delete process.env.GITHUB_DISPATCH_REPOSITORY;
    await expect(triggerRepositoryDispatch({ eventType: "x", clientPayload: {} })).rejects.toThrow(
      /GITHUB_DISPATCH_REPOSITORY is not configured/,
    );
  });

  it("triggerRepositoryDispatch posts to /repos/:owner/:repo/dispatches with the bearer token", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });
      // 1 回目: installation token 取得。2 回目: dispatch 本体。
      // First call: installation token. Second call: dispatch.
      if (url.includes("/access_tokens")) {
        return new Response(
          JSON.stringify({
            token: "ghs_X",
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await triggerRepositoryDispatch({
      eventType: "analyze-error",
      clientPayload: { api_error_id: "abc" },
      owner: "otomatty",
      repo: "zedi",
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe("https://api.github.com/repos/otomatty/zedi/dispatches");
    const auth = (calls[1]?.init?.headers as Record<string, string>)?.Authorization;
    expect(auth).toBe("Bearer ghs_X");
    const sentBody = JSON.parse(String(calls[1]?.init?.body));
    expect(sentBody.event_type).toBe("analyze-error");
    expect(sentBody.client_payload).toEqual({ api_error_id: "abc" });
  });
});

describe("verifyInstallationToken", () => {
  beforeEach(() => {
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_INSTALLATION_ID = "67890";
    process.env.GITHUB_APP_PRIVATE_KEY = "mocked-not-a-real-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
  });

  it("returns false for an empty token without hitting GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyInstallationToken("")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns true when GET /installation returns the matching installation id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toBe("https://api.github.com/installation");
      return new Response(JSON.stringify({ id: 67890 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyInstallationToken("ghs_ok")).toBe(true);
  });

  it("returns false when GET /installation returns a different installation id", async () => {
    // セキュリティ重要: 別のインストールから盗まれた token をはじく。
    // Security-critical: a token minted for a *different* installation of the
    // same App must not authenticate against ours.
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 99999 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyInstallationToken("ghs_other_install")).toBe(false);
  });

  it("returns false when GitHub returns non-2xx", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyInstallationToken("ghs_bad")).toBe(false);
  });

  it("returns false when response body is malformed", async () => {
    const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyInstallationToken("ghs_garbled")).toBe(false);
  });

  it("returns false when the response omits the id field", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ account: { login: "x" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyInstallationToken("ghs_no_id")).toBe(false);
  });
});
