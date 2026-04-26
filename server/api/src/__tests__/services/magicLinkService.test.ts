/**
 * `services/magicLinkService.ts` のユニットテスト。
 *
 * - Better Auth の `auth.handler` に正しい URL / メソッド / ペイロードで
 *   POST すること。
 * - `Accept-Language` ヘッダがロケールを伝搬していること (省略時 ja)。
 * - レスポンスが `ok` のときは `sent: true` を返し、`!ok` のときは body を
 *   error として返すこと。
 * - `auth.handler` が throw した場合も `sent: false` で握り潰すこと。
 *
 * Unit tests for the magic-link service. The Better Auth `auth` module pulls in
 * a long list of env vars at import time, so we mock both `../../auth.js` and
 * `../../lib/env.js` before importing the SUT.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const handlerMock = vi.fn();

/**
 * `getEnv` を vi.fn で差し替え、テストごとに `mockReturnValueOnce` などで
 * 値を上書きできるようにする。`vi.resetModules()` + `vi.doMock()` で再ロード
 * する旧パターンより軽量で速い。
 *
 * Backed by a single vi.fn so individual tests can override the return value
 * (e.g. with mockReturnValueOnce) without having to re-import the SUT module.
 */
const getEnvMock = vi.fn<(key: string) => string>();

vi.mock("../../auth.js", () => ({
  auth: { handler: (req: Request) => handlerMock(req) },
}));

vi.mock("../../lib/env.js", () => ({
  getEnv: (key: string) => getEnvMock(key),
  getOptionalEnv: () => "",
}));

const { sendInvitationMagicLink } = await import("../../services/magicLinkService.js");

describe("sendInvitationMagicLink", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    handlerMock.mockReset();
    // 既定では BETTER_AUTH_URL を末尾スラッシュ無しで返す。
    // Default: BETTER_AUTH_URL resolves without a trailing slash.
    getEnvMock.mockReset();
    getEnvMock.mockImplementation((key: string) => {
      if (key === "BETTER_AUTH_URL") return "https://api.example.com";
      throw new Error(`unexpected env lookup: ${key}`);
    });
    // Suppress the `[magicLinkService] Unexpected error` log emitted on throw.
    // throw 経路で出るエラーログを黙らせる。
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("POSTs to /api/auth/sign-in/magic-link with email + callbackURL JSON", async () => {
    handlerMock.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await sendInvitationMagicLink({
      email: "invitee@example.com",
      callbackURL: "https://app.example.com/notes/abc",
    });

    expect(result).toEqual({ sent: true, status: 200 });
    expect(handlerMock).toHaveBeenCalledTimes(1);
    const req = handlerMock.mock.calls[0][0] as Request;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.example.com/api/auth/sign-in/magic-link");
    expect(req.headers.get("content-type")).toBe("application/json");
    const body = (await req.json()) as { email: string; callbackURL: string };
    expect(body).toEqual({
      email: "invitee@example.com",
      callbackURL: "https://app.example.com/notes/abc",
    });
  });

  it("defaults Accept-Language to 'ja' when no locale is given", async () => {
    handlerMock.mockResolvedValue(new Response(null, { status: 200 }));

    await sendInvitationMagicLink({
      email: "x@example.com",
      callbackURL: "https://app.example.com/",
    });

    expect(handlerMock).toHaveBeenCalledTimes(1);
    const req = handlerMock.mock.calls[0][0] as Request;
    expect(req.headers.get("accept-language")).toBe("ja");
  });

  it("propagates the supplied locale via Accept-Language", async () => {
    handlerMock.mockResolvedValue(new Response(null, { status: 200 }));

    await sendInvitationMagicLink({
      email: "x@example.com",
      callbackURL: "https://app.example.com/",
      locale: "en",
    });

    expect(handlerMock).toHaveBeenCalledTimes(1);
    const req = handlerMock.mock.calls[0][0] as Request;
    expect(req.headers.get("accept-language")).toBe("en");
  });

  it("strips a trailing slash from BETTER_AUTH_URL when constructing the URL", async () => {
    // 1 回限り getEnv をスラッシュ付きで返し、`.replace(/\/$/, "")` を発火させる。
    // Override BETTER_AUTH_URL just for this call to exercise the
    // trailing-slash trim — far cheaper than reloading the SUT module.
    getEnvMock.mockReturnValueOnce("https://api.example.com/");
    handlerMock.mockResolvedValue(new Response(null, { status: 200 }));

    await sendInvitationMagicLink({
      email: "x@example.com",
      callbackURL: "https://app.example.com/",
    });

    expect(handlerMock).toHaveBeenCalledTimes(1);
    const req = handlerMock.mock.calls[0][0] as Request;
    expect(req.url).toBe("https://api.example.com/api/auth/sign-in/magic-link");
  });

  it("returns sent=false with the response body when Better Auth replies non-OK", async () => {
    handlerMock.mockResolvedValue(
      new Response("rate limited", { status: 429, statusText: "Too Many Requests" }),
    );
    const result = await sendInvitationMagicLink({
      email: "x@example.com",
      callbackURL: "https://app.example.com/",
    });
    expect(result.sent).toBe(false);
    expect(result.status).toBe(429);
    expect(result.error).toBe("rate limited");
  });

  it("falls back to a synthetic error message when the response body is empty", async () => {
    handlerMock.mockResolvedValue(new Response("", { status: 500 }));
    const result = await sendInvitationMagicLink({
      email: "x@example.com",
      callbackURL: "https://app.example.com/",
    });
    expect(result.sent).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toMatch(/failed with status 500/i);
  });

  it("catches handler-thrown errors and returns sent=false (no propagation)", async () => {
    // Better Auth が例外を投げても呼び出し側にリークさせない。
    // The wrapper must absorb thrown errors so callers see a clean result object.
    handlerMock.mockRejectedValue(new Error("network down"));
    const result = await sendInvitationMagicLink({
      email: "x@example.com",
      callbackURL: "https://app.example.com/",
    });
    expect(result.sent).toBe(false);
    expect(result.error).toBe("network down");
    expect(result.status).toBeUndefined();
  });
});
