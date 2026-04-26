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

vi.mock("../../auth.js", () => ({
  auth: { handler: (req: Request) => handlerMock(req) },
}));

vi.mock("../../lib/env.js", () => ({
  getEnv: (key: string) => {
    if (key === "BETTER_AUTH_URL") return "https://api.example.com";
    throw new Error(`unexpected env lookup: ${key}`);
  },
  getOptionalEnv: () => "",
}));

const { sendInvitationMagicLink } = await import("../../services/magicLinkService.js");

describe("sendInvitationMagicLink", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    handlerMock.mockReset();
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
    const req = handlerMock.mock.calls[0]?.[0] as Request;
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

    const req = handlerMock.mock.calls[0]?.[0] as Request;
    expect(req.headers.get("accept-language")).toBe("ja");
  });

  it("propagates the supplied locale via Accept-Language", async () => {
    handlerMock.mockResolvedValue(new Response(null, { status: 200 }));

    await sendInvitationMagicLink({
      email: "x@example.com",
      callbackURL: "https://app.example.com/",
      locale: "en",
    });

    const req = handlerMock.mock.calls[0]?.[0] as Request;
    expect(req.headers.get("accept-language")).toBe("en");
  });

  it("strips a trailing slash from BETTER_AUTH_URL when constructing the URL", async () => {
    // getEnv はテスト先頭で固定値 ("https://api.example.com") を返すため、
    // 別途モジュールを再ロードして末尾スラッシュ版を試す。
    // Reload the module with a slash-suffixed BETTER_AUTH_URL to exercise
    // the `.replace(/\/$/, "")` call.
    vi.resetModules();
    handlerMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.doMock("../../auth.js", () => ({
      auth: { handler: (req: Request) => handlerMock(req) },
    }));
    vi.doMock("../../lib/env.js", () => ({
      getEnv: () => "https://api.example.com/",
      getOptionalEnv: () => "",
    }));
    const { sendInvitationMagicLink: send } = await import("../../services/magicLinkService.js");
    await send({ email: "x@example.com", callbackURL: "https://app.example.com/" });
    const req = handlerMock.mock.calls[0]?.[0] as Request;
    expect(req.url).toBe("https://api.example.com/api/auth/sign-in/magic-link");
    vi.resetModules();
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
