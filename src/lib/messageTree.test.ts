import { describe, it, expect } from "vitest";
import type { TreeChatMessage } from "../types/aiChat";
import {
  addMessageToTree,
  buildApiMessages,
  collectSubtreeIds,
  deleteSubtree,
  findLeaf,
  getActivePath,
  getChildren,
  getSiblings,
  switchToSibling,
} from "./messageTree";

function msg(
  id: string,
  role: TreeChatMessage["role"],
  parentId: string | null,
  timestamp: number,
  content = "",
): TreeChatMessage {
  return { id, role, parentId, content, timestamp };
}

describe("getActivePath", () => {
  it("returns root-to-leaf order for a linear conversation", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1, "Hi"),
      a1: msg("a1", "assistant", "u1", 2, "Hello"),
      u2: msg("u2", "user", "a1", 3, "More"),
      a2: msg("a2", "assistant", "u2", 4, "Sure"),
    };
    expect(getActivePath(map, "a2").map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("returns only the path for activeLeafId when branches exist", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
      a1b: msg("a1b", "assistant", "u1", 3),
      u2: msg("u2", "user", "a1b", 4),
    };
    expect(getActivePath(map, "a1b").map((m) => m.id)).toEqual(["u1", "a1b"]);
    expect(getActivePath(map, "u2").map((m) => m.id)).toEqual(["u1", "a1b", "u2"]);
  });

  it("returns empty array when activeLeafId is null", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
    };
    expect(getActivePath(map, null)).toEqual([]);
  });

  it("returns empty array when messageMap is empty", () => {
    expect(getActivePath({}, "x")).toEqual([]);
  });

  it("returns empty array when activeLeafId is missing from map", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
    };
    expect(getActivePath(map, "missing")).toEqual([]);
  });
});

describe("getChildren", () => {
  it("returns children sorted by timestamp ascending", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      aLate: msg("aLate", "assistant", "u1", 30),
      aEarly: msg("aEarly", "assistant", "u1", 10),
    };
    expect(getChildren(map, "u1").map((c) => c.id)).toEqual(["aEarly", "aLate"]);
  });

  it("returns root-level children when parentId is null", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      u2: msg("u2", "user", null, 2),
    };
    expect(getChildren(map, null).map((c) => c.id)).toEqual(["u1", "u2"]);
  });

  it("returns empty array when there are no children", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
    };
    expect(getChildren(map, "u1")).toEqual([]);
  });
});

describe("getSiblings", () => {
  it("returns sibling list and current index", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 10),
      a2: msg("a2", "assistant", "u1", 20),
    };
    const { siblings, index } = getSiblings(map, "a2");
    expect(siblings.map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(index).toBe(1);
  });

  it("returns only self when there are no other siblings", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
    };
    const { siblings, index } = getSiblings(map, "a1");
    expect(siblings.map((s) => s.id)).toEqual(["a1"]);
    expect(index).toBe(0);
  });

  it("handles multiple root-level siblings", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      u2: msg("u2", "user", null, 2),
    };
    const { siblings, index } = getSiblings(map, "u2");
    expect(siblings.map((s) => s.id)).toEqual(["u1", "u2"]);
    expect(index).toBe(1);
  });
});

describe("findLeaf", () => {
  it("returns the last node in a linear chain", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
    };
    expect(findLeaf(map, "u1")).toBe("a1");
  });

  it("follows the child with the greatest timestamp when branching", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      aOld: msg("aOld", "assistant", "u1", 10),
      aNew: msg("aNew", "assistant", "u1", 50),
    };
    expect(findLeaf(map, "u1")).toBe("aNew");
  });

  it("returns the node id when it has no children", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
    };
    expect(findLeaf(map, "u1")).toBe("u1");
  });
});

describe("switchToSibling", () => {
  it("returns the leaf of the next sibling subtree", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 10),
      u1b: msg("u1b", "user", "a1", 11),
      a1tail: msg("a1tail", "assistant", "u1b", 12),
      a2: msg("a2", "assistant", "u1", 20),
      u2b: msg("u2b", "user", "a2", 21),
    };
    expect(switchToSibling(map, "a1", "next")).toBe(findLeaf(map, "a2"));
  });

  it("returns the leaf of the previous sibling subtree", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 10),
      a2: msg("a2", "assistant", "u1", 20),
    };
    expect(switchToSibling(map, "a2", "prev")).toBe(findLeaf(map, "a1"));
  });

  it("wraps from last to first on next", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 10),
      a2: msg("a2", "assistant", "u1", 20),
    };
    expect(switchToSibling(map, "a2", "next")).toBe(findLeaf(map, "a1"));
  });

  it("wraps from first to last on prev", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 10),
      a2: msg("a2", "assistant", "u1", 20),
    };
    expect(switchToSibling(map, "a1", "prev")).toBe(findLeaf(map, "a2"));
  });
});

describe("collectSubtreeIds", () => {
  it("includes the root node and all descendants", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
      u2: msg("u2", "user", "a1", 3),
      a2: msg("a2", "assistant", "u2", 4),
    };
    const ids = collectSubtreeIds(map, "a1");
    expect(ids).toEqual(new Set(["a1", "u2", "a2"]));
  });

  it("returns only the node when it has no children", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
    };
    expect(collectSubtreeIds(map, "u1")).toEqual(new Set(["u1"]));
  });
});

describe("deleteSubtree", () => {
  it("returns null when deleting the root", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
    };
    expect(deleteSubtree(map, "u1", "a1", "u1")).toBeNull();
  });

  it("returns null when node is missing", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
    };
    expect(deleteSubtree(map, "u1", "u1", "missing")).toBeNull();
  });

  it("removes subtree and keeps activeLeaf when outside deleted region", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
      a1b: msg("a1b", "assistant", "u1", 3),
      u2: msg("u2", "user", "a1b", 4),
    };
    const result = deleteSubtree(map, "u1", "u2", "a1");
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.messageMap.a1).toBeUndefined();
    expect(result.messageMap.u2).toBeDefined();
    expect(result.activeLeafId).toBe("u2");
    expect(result.rootMessageId).toBe("u1");
  });

  it("reassigns activeLeaf when it was inside deleted subtree", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 10),
      a2: msg("a2", "assistant", "u1", 20),
      u2: msg("u2", "user", "a2", 21),
    };
    const result = deleteSubtree(map, "u1", "u2", "a2");
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.messageMap.a2).toBeUndefined();
    expect(result.messageMap.u2).toBeUndefined();
    expect(result.activeLeafId).toBe(findLeaf(result.messageMap, "a1"));
  });
});

describe("addMessageToTree", () => {
  it("adds a message and returns a new map", () => {
    const map: Record<string, TreeChatMessage> = {};
    const m = msg("u1", "user", null, 1, "Hi");
    const next = addMessageToTree(map, m);
    expect(map).toEqual({});
    expect(next.u1).toEqual(m);
  });

  it("supports root and non-root messages", () => {
    const u1 = msg("u1", "user", null, 1);
    const map1 = addMessageToTree({}, u1);
    const a1 = msg("a1", "assistant", "u1", 2);
    const map2 = addMessageToTree(map1, a1);
    expect(map2.a1.parentId).toBe("u1");
  });
});

describe("buildApiMessages", () => {
  it("builds role/content pairs from the active path excluding system", () => {
    const map: Record<string, TreeChatMessage> = {
      u1: msg("u1", "user", null, 1, "Hi"),
      sys: msg("sys", "system", "u1", 2, "ignored"),
      a1: msg("a1", "assistant", "sys", 3, "Hello"),
    };
    expect(buildApiMessages(map, "a1")).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ]);
  });

  it("returns empty array when activeLeafId is null", () => {
    expect(buildApiMessages({}, null)).toEqual([]);
  });
});
