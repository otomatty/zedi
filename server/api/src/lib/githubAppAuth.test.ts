/**
 * `githubAppAuth` の単体テスト (Epic #616 Phase 2 / sub-issue #805)。
 *
 * - `readDispatchRepository`: env 解析（owner/repo, 未設定, 不正値）
 * - `getInstallationToken`: モック fetch 越しのキャッシュ挙動
 * - `triggerRepositoryDispatch`: 設定欠落時のエラーと正常時のリクエスト形状
 *
 * Unit tests for `githubAppAuth`. Network calls are mocked by stubbing the
 * global `fetch`, and the in-module token cache is reset between tests via
 * the exported `__resetInstallationTokenCacheForTests` helper so each test
 * starts from a deterministic state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  __resetInstallationTokenCacheForTests,
  getInstallationToken,
  readDispatchRepository,
  triggerRepositoryDispatch,
} from "./githubAppAuth.js";

// テスト用 PEM。RSA 2048 bit, PKCS#8。テスト中だけ使う使い捨て鍵。
// Disposable RSA-2048 PKCS#8 PEM used only during tests; do not reuse outside.
const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
MzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuictGeurT8jNbvJZHtCSuYEvu
NMoSfm76oqFvAp8Gy0iz5sxjZmSnXyCdPEovGhLa0VzMaQ8s+CLOyS56YyCFGeJZ
qgtzJ6GR3eqoYSW9b9UMvkBpZODSctWSNGj3P7jRFDO5VoTwCQAWbFnOjDfH5Ulg
p2PKSQnSJP3AJLQNFNe7br1XbrhV//eO+t51mIpGSDCUv3E0DDFcWDTH9cXDTTlR
ZVEiR2BwpZOOkE/Z0/BVnhZYL71oZV34bKfWjQIt6V/isSMahdsAASACp4ZTGtwi
VuNd9tybAgMBAAECggEAVc0HhJ/KJHfhjkEMKE5sROhntQWuXp42rEcwKZ3os3VR
1BjzjXQdKp+UROBYOQGcGmCD78vMLbn78Yh+RCv8UAJZzAlVf8eEfQoTxxojTLmZ
i2I7GpghKIjDyQAyOAWmZN8Qp8Hz/fVPMcG8h2PTPhFxQgjJB7hFfcJsXtv6zIag
v+KeoESNKf9xmH5o5WLyNaRBJ1DK9Cmt5nYyy+8ftXnQq8HppOPK9pYr3W9XTHjF
DtAZyAkKddF80z3YA6NWyEWh/gZ9GDtDCxWoVI1JqDQK1Y3i9lNGvExTrEefbJQF
yCyDRbHPwkydL7Gd4gPjbXhccYKHZUpyqd87fc0poQKBgQDzh+oyrA4F84pq5zMm
4jSUZbZbjp4hZAkVbB6AZAnK8O1mTcDrcjZIQ1adnaCPgaBjsnBdVMdq+zAdEN/J
2RFpPN4n4HpvXSTxe/hEIxQv0v0XhvhmM8XNumC+4Vbkfsy6Pg8+L65GFy+k88iV
DpcvGvUySMl9+9R26YNrAwsUGwKBgQDFL/ZvT2XTQkcoGY9P36Yta4S3W3i/VW5e
38IBHNm7zb+sDGw1DsWGSKM4DtxP3R0+cElrEzSx0ICZQJ9tjROvKRC2Chx0HaJj
SDOhhsC4MBoqTGz7WKU5HxgY5p0iOcvjFjnIrG3lCt5ZBaVSeKpPtJzZb5hzOpLs
n9cs/rWlIQKBgF4dC/6cFqLPgxvSwNQ4EMjPSBtoHchhkIs2DOxx9DK/cFFcxjyy
T+wpXnk3SwvuO5BgaUbgxIzIvjNiR8+LYpRtcM37LcGE//MJ4qfIz3fBXewEoP3x
MEkXSTmNqCcLgC4S7gHfzAVf/oREEa6fewd2u7qdGYOSpRy7p8yEsVxJAoGADUcS
wMrtrA8zumlPv+EgQbbg2lI7TCmVH1fWLAFb1cSTWeAmLfXCmsM1ZYlW4aS4z+lU
LbmZPeAlhJMuFcQ/r0POqRAUgUaJv+nlNVWmokbywCsBoEY/5cXhPo2eJ6FYY9FJ
SVxKb3tzq4IHpf4F8WJwO8z4i9Lq0UZ3dTLi8EECgYEA0wAEh4+AVGbg4kGVU9YJ
cyaXdoxe8yflsi05F8R5OLUjgbXfKOZRDgxWJyqNFwGsVOQ8b5AszqM9+jRkEWj/
UqWjVzsAiv5uRnDrBJSIIz8ymdQ9y5NfZf/9dnjV7Fs2xFLLqo7w6Kn2KbWA5J5b
PhBSjz2eOhevAQrpvqdYvUw=
-----END PRIVATE KEY-----`;

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
    process.env.GITHUB_APP_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
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
