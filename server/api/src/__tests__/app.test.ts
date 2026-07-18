import { describe, it, expect, vi } from "vitest";

// auth.js は module-load 時に Better Auth を初期化するため、ルーティング
// テーブルの検証には不要な env 依存を避けてスタブする。
vi.mock("../auth.js", () => ({
  auth: { handler: vi.fn(async () => new Response(null, { status: 200 })) },
}));

import { createApp } from "../app.js";

/** app.routes からパス一覧を取り出す（メソッド不問・重複許容） */
function registeredPaths(app: { routes: { path: string }[] }): string[] {
  return app.routes.map((r) => r.path);
}

describe("createApp — agent route split (FR-1)", () => {
  it("registers no agent routes by default (worker entry shape)", () => {
    const app = createApp();
    const paths = registeredPaths(app);
    expect(paths.some((p) => p.startsWith("/api/ingest"))).toBe(false);
    expect(paths.some((p) => p.includes("compose-sessions"))).toBe(false);
  });

  it("invokes registerAgentRoutes hook exactly once with the app", () => {
    const hook = vi.fn();
    const app = createApp({ registerAgentRoutes: hook });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(app);
  });

  it("keeps non-agent routes registered regardless of the hook", () => {
    const app = createApp();
    const paths = registeredPaths(app);
    expect(paths.some((p) => p.startsWith("/api/pages"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/media"))).toBe(true);
  });
});
