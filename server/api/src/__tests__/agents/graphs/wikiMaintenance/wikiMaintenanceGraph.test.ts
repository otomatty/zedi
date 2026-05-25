/**
 * Wiki maintenance graph (#953) — wiring + scan node tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { scanBrokenLinks, scanStubPages } = vi.hoisted(() => ({
  scanBrokenLinks: vi.fn(),
  scanStubPages: vi.fn(),
}));

vi.mock("../../../../agents/graphs/wikiMaintenance/nodes/index.js", async () => {
  const real = await vi.importActual<
    typeof import("../../../../agents/graphs/wikiMaintenance/nodes/index.js")
  >("../../../../agents/graphs/wikiMaintenance/nodes/index.js");
  return { ...real, scanBrokenLinks, scanStubPages };
});

import { GraphRunner } from "../../../../agents/runner/graphRunner.js";
import { __resetRegistryForTests } from "../../../../agents/registry/graphRegistry.js";
import {
  WIKI_MAINTENANCE_GRAPH_ID,
  registerWikiMaintenanceGraph,
} from "../../../../agents/graphs/wikiMaintenance/index.js";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";

function fakeContext(threadId: string): GraphContext {
  return {
    threadId,
    sessionId: threadId,
    userId: "user-1",
    pageId: "page-1",
    graphId: WIKI_MAINTENANCE_GRAPH_ID,
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "wiki_maintenance:test",
    userEmail: null,
  };
}

describe("wikiMaintenanceGraph", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerWikiMaintenanceGraph();
    scanBrokenLinks.mockReset();
    scanStubPages.mockReset();
    scanBrokenLinks.mockImplementation(async () => ({
      brokenLinkFindings: [
        {
          rule: "broken_link",
          severity: "error",
          pageIds: ["p1", "p2"],
          detail: { sourceId: "p1" },
        },
      ],
      phase: "maintenance:broken_links_scanned",
    }));
    scanStubPages.mockImplementation(async () => ({
      stubPageFindings: [
        {
          rule: "stub_page",
          severity: "info",
          pageIds: ["p3"],
          detail: { title: "Draft" },
        },
      ],
      phase: "maintenance:stub_pages_scanned",
    }));
  });

  afterEach(() => {
    __resetRegistryForTests();
  });

  it("runs scan → plan and completes with a maintenance plan", async () => {
    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: WIKI_MAINTENANCE_GRAPH_ID,
        context: fakeContext("maint-1"),
        checkpointer: false,
        recursionLimit: 20,
      },
      { kind: "input", value: {} },
    );

    expect(result.status).toBe("completed");
    expect(scanBrokenLinks).toHaveBeenCalledTimes(1);
    expect(scanStubPages).toHaveBeenCalledTimes(1);

    const out = result.output as {
      maintenancePlan?: { brokenLinkCount: number; stubPageCount: number; findings: unknown[] };
      phase?: string;
    };
    expect(out.phase).toBe("maintenance:planned");
    expect(out.maintenancePlan?.brokenLinkCount).toBe(1);
    expect(out.maintenancePlan?.stubPageCount).toBe(1);
    expect(out.maintenancePlan?.findings).toHaveLength(2);
  });
});
