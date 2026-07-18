import { describe, it, expect } from "vitest";
import { FORBIDDEN_MARKERS, findForbiddenMarkers } from "./checkWorkerBundle.lib.js";

describe("findForbiddenMarkers — Worker bundle guard (FR-1.2 / FR-2.3 / LC-5)", () => {
  it("flags LangGraph package code (esbuild node_modules path comment)", () => {
    const hits = findForbiddenMarkers(
      "// node_modules/@langchain/langgraph/dist/index.js\nvar x=1;",
    );
    expect(hits).toContain("node_modules/@langchain/");
  });

  it("flags agent source modules", () => {
    const hits = findForbiddenMarkers("// src/agents/runner/graphRunner.ts\nvar y=2;");
    expect(hits).toContain("src/agents/");
  });

  it("flags @hono/node-server and @sentry/node", () => {
    expect(findForbiddenMarkers("// node_modules/@hono/node-server/dist/conninfo.js")).toContain(
      "node_modules/@hono/node-server/",
    );
    expect(findForbiddenMarkers("// node_modules/@sentry/node/build/index.js")).toContain(
      "node_modules/@sentry/node/",
    );
  });

  it("flags ioredis (Node-only KV adapter must stay out of the Worker)", () => {
    expect(findForbiddenMarkers("// node_modules/ioredis/built/Redis.js")).toContain(
      "node_modules/ioredis/",
    );
  });

  it("does not flag @sentry/cloudflare or clean worker code", () => {
    const clean = [
      "// node_modules/@sentry/cloudflare/build/index.js",
      "// node_modules/hono/dist/index.js",
      "// src/lib/clientIp.ts",
      'var app = "zedi";',
    ].join("\n");
    expect(findForbiddenMarkers(clean)).toEqual([]);
  });

  it("returns each marker at most once", () => {
    const doubled =
      "// node_modules/@langchain/core/a.js\n// node_modules/@langchain/langgraph/b.js";
    const hits = findForbiddenMarkers(doubled);
    expect(hits.filter((h) => h === "node_modules/@langchain/")).toHaveLength(1);
  });

  it("exposes exactly the five designed markers", () => {
    expect([...FORBIDDEN_MARKERS].sort()).toEqual(
      [
        "node_modules/@hono/node-server/",
        "node_modules/@langchain/",
        "node_modules/@sentry/node/",
        "node_modules/ioredis/",
        "src/agents/",
      ].sort(),
    );
  });
});
