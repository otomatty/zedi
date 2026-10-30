import { describe, expect, it, vi } from "vitest";
import { createRouter, matchRoute, shouldInterceptClick, type HistoryLike } from "./router";

const routes = [
  { path: "/notes", value: "list" },
  { path: "/notes/:id", value: "editor" },
  { path: "/ai", value: "ai" },
];

function createMemoryHistory(initial: string): HistoryLike & { entries: string[]; back(): void } {
  const listeners = new Set<() => void>();
  const entries = [initial];
  const history = {
    entries,
    location: { pathname: initial },
    pushState(_: unknown, __: string, url: string) {
      entries.push(url);
      history.location.pathname = url;
    },
    replaceState(_: unknown, __: string, url: string) {
      entries[entries.length - 1] = url;
      history.location.pathname = url;
    },
    addEventListener(_: "popstate", fn: () => void) {
      listeners.add(fn);
    },
    removeEventListener(_: "popstate", fn: () => void) {
      listeners.delete(fn);
    },
    back() {
      entries.pop();
      history.location.pathname = entries[entries.length - 1] ?? "/";
      listeners.forEach((fn) => fn());
    },
  };
  return history;
}

describe("matchRoute", () => {
  it("matches static paths and tolerates a trailing slash", () => {
    expect(matchRoute(routes, "/notes")?.value).toBe("list");
    expect(matchRoute(routes, "/notes/")?.value).toBe("list");
  });

  it("extracts and decodes path params", () => {
    expect(matchRoute(routes, "/notes/%E7%9F%A5%E8%AD%98")).toEqual({
      value: "editor",
      params: { id: "知識" },
      path: "/notes/%E7%9F%A5%E8%AD%98",
    });
  });

  it("returns null when no route matches or a param segment is empty", () => {
    expect(matchRoute(routes, "/unknown")).toBeNull();
    expect(matchRoute(routes, "/notes/a/b")).toBeNull();
  });
});

describe("createRouter", () => {
  it("exposes the initial match and notifies subscribers on navigate", () => {
    const history = createMemoryHistory("/notes");
    const router = createRouter(routes, history);
    const listener = vi.fn();
    router.subscribe(listener);

    expect(router.current()?.value).toBe("list");
    router.navigate("/notes/n1");

    expect(history.entries).toEqual(["/notes", "/notes/n1"]);
    expect(router.current()?.params).toEqual({ id: "n1" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("replaces the current entry when requested", () => {
    const history = createMemoryHistory("/notes");
    const router = createRouter(routes, history);
    router.navigate("/ai", { replace: true });
    expect(history.entries).toEqual(["/ai"]);
  });

  it("follows browser back navigation via popstate and stops after dispose", () => {
    const history = createMemoryHistory("/notes");
    const router = createRouter(routes, history);
    const listener = vi.fn();
    router.subscribe(listener);
    router.navigate("/ai");
    history.back();
    expect(router.current()?.value).toBe("list");
    expect(listener).toHaveBeenCalledTimes(2);

    router.dispose();
    history.pushState(null, "", "/ai");
    history.back();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("shouldInterceptClick", () => {
  const plain = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
  };
  const sameOrigin = { origin: "https://app.test", target: "", hasDownload: false };

  it("intercepts a plain left click on a same-origin link", () => {
    expect(shouldInterceptClick(plain, sameOrigin, "https://app.test")).toBe(true);
  });

  it.each([
    ["modifier key", { ...plain, metaKey: true }, sameOrigin],
    ["middle click", { ...plain, button: 1 }, sameOrigin],
    ["already handled", { ...plain, defaultPrevented: true }, sameOrigin],
    ["new tab target", plain, { ...sameOrigin, target: "_blank" }],
    ["download link", plain, { ...sameOrigin, hasDownload: true }],
    ["external origin", plain, { ...sameOrigin, origin: "https://other.test" }],
  ])("lets the browser handle a %s", (_, event, anchor) => {
    expect(shouldInterceptClick(event, anchor, "https://app.test")).toBe(false);
  });
});
