import { describe, it, expect } from "vitest";
import type { MessageMap, TreeChatMessage } from "../types/aiChat";
import { buildFlowGraph } from "./messageTreeLayout";

function msg(
  id: string,
  role: TreeChatMessage["role"],
  parentId: string | null,
  timestamp: number,
  content = "",
): TreeChatMessage {
  return { id, role, parentId, content, timestamp };
}

describe("buildFlowGraph", () => {
  it("returns empty nodes and edges when rootMessageId is null", () => {
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1),
    };
    const { nodes, edges } = buildFlowGraph(map, null, "u1");
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it("returns empty when messageMap is empty", () => {
    const { nodes, edges } = buildFlowGraph({}, "u1", null);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it("builds linear tree with correct node data and isOnActivePath", () => {
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1, "Hello"),
      a1: msg("a1", "assistant", "u1", 2, "Hi there"),
      u2: msg("u2", "user", "a1", 3, "More info"),
    };
    const { nodes, edges } = buildFlowGraph(map, "u1", "u2");

    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);

    const u1Node = nodes.find((n) => n.id === "u1");
    expect(u1Node?.data.role).toBe("user");
    expect(u1Node?.data.contentPreview).toBe("Hello");
    expect(u1Node?.data.isOnActivePath).toBe(true);
    expect(u1Node?.data.isActiveLeaf).toBe(false);

    const u2Node = nodes.find((n) => n.id === "u2");
    expect(u2Node?.data.isOnActivePath).toBe(true);
    expect(u2Node?.data.isActiveLeaf).toBe(true);

    expect(edges.map((e) => `${e.source}-${e.target}`)).toEqual(["u1-a1", "a1-u2"]);
  });

  it("marks nodes on active path vs off path for branched tree", () => {
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
      a1b: msg("a1b", "assistant", "u1", 3),
      u2: msg("u2", "user", "a1b", 4),
    };
    const { nodes, edges } = buildFlowGraph(map, "u1", "u2");

    expect(nodes).toHaveLength(4);
    expect(edges).toHaveLength(3);

    const a1Node = nodes.find((n) => n.id === "a1");
    const a1bNode = nodes.find((n) => n.id === "a1b");
    expect(a1Node?.data.isOnActivePath).toBe(false);
    expect(a1bNode?.data.isOnActivePath).toBe(true);
    expect(a1bNode?.data.isActiveLeaf).toBe(false);

    const u2Node = nodes.find((n) => n.id === "u2");
    expect(u2Node?.data.isActiveLeaf).toBe(true);
  });

  it("truncates content preview to 40 chars with ellipsis", () => {
    const longContent = "x".repeat(50);
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1, longContent),
    };
    const { nodes } = buildFlowGraph(map, "u1", "u1");
    expect(nodes[0]?.data.contentPreview).toBe("x".repeat(40) + "…");
  });

  it("assigns valid positions from dagre layout", () => {
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
    };
    const { nodes } = buildFlowGraph(map, "u1", "a1");
    expect(nodes).toHaveLength(2);
    nodes.forEach((n) => {
      expect(typeof n.position.x).toBe("number");
      expect(typeof n.position.y).toBe("number");
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    });
  });
});
