/**
 * `getComposeModelIdsForGraph` unit tests — BYOK validation inputs (#953).
 */
import { describe, expect, it } from "vitest";
import { getComposeModelIdsForGraph } from "./composeModelConfig.js";
import { WIKI_MAINTENANCE_GRAPH_ID } from "../graphs/wikiMaintenance/index.js";

describe("getComposeModelIdsForGraph", () => {
  it("returns no model ids for wiki-maintenance (lint-only graph)", () => {
    expect(getComposeModelIdsForGraph(WIKI_MAINTENANCE_GRAPH_ID)).toEqual([]);
  });
});
