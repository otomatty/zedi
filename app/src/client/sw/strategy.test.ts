import { describe, expect, it } from "vitest";
import { strategyFor } from "./strategy";

const ORIGIN = "https://zedi.test";
const request = (path: string, init: { method?: string; mode?: RequestMode } = {}) => ({
  url: path.startsWith("http") ? path : `${ORIGIN}${path}`,
  method: init.method ?? "GET",
  mode: init.mode ?? ("cors" as RequestMode),
});

describe("strategyFor", () => {
  it("serves built assets from the cache first", () => {
    expect(strategyFor(request("/assets/index-3f9a.js"), ORIGIN)).toBe("cacheFirst");
    expect(strategyFor(request("/assets/EditorPage-b81c.css"), ORIGIN)).toBe("cacheFirst");
  });

  it("loads app pages from the network and falls back to the cached app shell", () => {
    for (const path of ["/", "/notes", "/notes/0a1b", "/ai"]) {
      expect(strategyFor(request(path, { mode: "navigate" }), ORIGIN)).toBe("appShell");
    }
  });

  it("keeps the last response of the page data APIs for offline use", () => {
    for (const path of [
      "/api/me",
      "/api/notes/n1/pages?limit=100",
      "/api/notes/n1/pages?limit=100&cursor=abc",
      "/api/pages/p1",
    ]) {
      expect(strategyFor(request(path), ORIGIN)).toBe("networkFirst");
    }
  });

  it("never caches auth, search, AI, realtime, writes or other origins", () => {
    const passthrough = [
      request("/api/auth/get-session"),
      request("/api/search?q=abc"),
      request("/api/ai/chat?tokens=10"),
      request("/api/dev/outbox"),
      request("/parties/page-room/p1"),
      request("/api/notes/n1/pages", { method: "POST" }),
      request("/api/notes/n1/members", { method: "POST" }),
      request("https://cdn.example.com/assets/app.js"),
      request("/sw.js"),
    ];
    for (const r of passthrough) expect(strategyFor(r, ORIGIN), r.url).toBe("network");
  });

  it("leaves navigations to the API alone (magic-link verification)", () => {
    const verify = request("/api/auth/magic-link/verify?token=t&callbackURL=%2Fnotes", {
      mode: "navigate",
    });

    expect(strategyFor(verify, ORIGIN)).toBe("network");
  });
});
