/**
 * adminFetch / getErrorMessage の単体テスト。
 * Unit tests for adminFetch / getErrorMessage.
 *
 * `adminFetch` は global の `fetch` をモックして検証し、
 * `getErrorMessage` は `Response` を直接組み立てて分岐を網羅する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { adminFetch, getErrorMessage } from "./client";

describe("getErrorMessage", () => {
  it("レスポンス JSON の message を trim して返す / returns trimmed message from JSON body", async () => {
    const res = new Response(JSON.stringify({ message: "  Boom  " }), { status: 500 });
    await expect(getErrorMessage(res, "fallback")).resolves.toBe("Boom");
  });

  it("message が無い場合は statusText を使う / falls back to statusText when message is missing", async () => {
    const res = new Response(JSON.stringify({ other: "x" }), {
      status: 503,
      statusText: "Service Unavailable",
    });
    await expect(getErrorMessage(res, "fallback")).resolves.toBe("Service Unavailable");
  });

  it("body が JSON でない場合も statusText に倒す / uses statusText when body is not JSON", async () => {
    const res = new Response("not-json-body", {
      status: 502,
      statusText: "Bad Gateway",
    });
    await expect(getErrorMessage(res, "fallback")).resolves.toBe("Bad Gateway");
  });

  it("message が空白だけのとき fallback を返す / returns fallback when message is blank", async () => {
    const res = new Response(JSON.stringify({ message: "   " }), {
      status: 500,
      statusText: "",
    });
    await expect(getErrorMessage(res, "fallback")).resolves.toBe("fallback");
  });

  it("message が文字列以外なら無視して statusText / fallback を使う / ignores non-string message", async () => {
    const res = new Response(JSON.stringify({ message: 42 }), {
      status: 500,
      statusText: "",
    });
    await expect(getErrorMessage(res, "fallback")).resolves.toBe("fallback");
  });

  it("statusText も空のとき fallback を返す / returns fallback when both message and statusText are empty", async () => {
    const res = new Response(null, { status: 500, statusText: "" });
    await expect(getErrorMessage(res, "fallback")).resolves.toBe("fallback");
  });
});

describe("adminFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("credentials: include を必ず指定する / always sets credentials: 'include'", async () => {
    await adminFetch("/api/foo");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/foo",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("body があるとき Content-Type: application/json を付与する / sets JSON content-type when body is present", async () => {
    await adminFetch("/api/foo", { method: "POST", body: JSON.stringify({ a: 1 }) });
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("FormData の場合は Content-Type を勝手に付けない / does not override Content-Type for FormData body", async () => {
    const fd = new FormData();
    fd.append("k", "v");
    await adminFetch("/api/foo", { method: "POST", body: fd });
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("呼び出し側で Content-Type を指定したらそのまま使う / preserves caller-supplied Content-Type", async () => {
    await adminFetch("/api/foo", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hi",
    });
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("text/plain");
  });

  it("先頭に / が無いパスでも / を付ける / normalises path without leading slash", async () => {
    await adminFetch("api/foo");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/foo", expect.any(Object));
  });
});
