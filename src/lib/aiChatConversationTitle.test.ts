import { describe, it, expect } from "vitest";
import { generateConversationTitleFromTree } from "./aiChatConversationTitle";
import type { TreeChatMessage } from "../types/aiChat";

/**
 * Build a small message-map with the given ordered chain (root → ... → leaf).
 * 親子チェーンを 1 行で組み立てるユーティリティ。
 */
function chain(
  ...nodes: Array<
    Partial<TreeChatMessage> & { id: string; role: TreeChatMessage["role"]; content: string }
  >
): {
  map: Record<string, TreeChatMessage>;
  leafId: string;
} {
  const map: Record<string, TreeChatMessage> = {};
  let parentId: string | null = null;
  let ts = 1;
  for (const n of nodes) {
    map[n.id] = {
      id: n.id,
      role: n.role,
      content: n.content,
      timestamp: n.timestamp ?? ts++,
      parentId: n.parentId ?? parentId,
    };
    parentId = n.id;
  }
  return { map, leafId: nodes[nodes.length - 1].id };
}

describe("generateConversationTitleFromTree", () => {
  describe("empty / no-user-message branch", () => {
    it("returns empty string when no user message exists on the active path", () => {
      // ユーザーメッセージが無ければ空文字（呼び出し側が未設定ラベルを出す）。
      // Pin the empty-string sentinel for the no-user branch.
      const { map, leafId } = chain({ id: "a", role: "assistant", content: "hi" });
      expect(generateConversationTitleFromTree(map, leafId)).toBe("");
    });

    it("returns empty string when activeLeafId is null", () => {
      // null のリーフは getActivePath で空配列を返すため、空文字に落ちる。
      // Pin the null-leaf path through getActivePath.
      const { map } = chain({ id: "a", role: "user", content: "ignored" });
      expect(generateConversationTitleFromTree(map, null)).toBe("");
    });

    it("returns empty string for an empty map", () => {
      // 空マップでも例外を出さず、空文字を返す。
      // Pin the empty-map fallback.
      expect(generateConversationTitleFromTree({}, "missing")).toBe("");
    });
  });

  describe("first-user-message selection", () => {
    it("uses the FIRST user message on the path (not subsequent ones)", () => {
      // assistant を挟んで複数の user メッセージがあるとき、最初の user の内容を使う。
      // Pin `path.find(m => m.role === "user")`; a `findLast`/swap mutation surfaces here.
      const { map, leafId } = chain(
        { id: "u1", role: "user", content: "first message" },
        { id: "a1", role: "assistant", content: "ack" },
        { id: "u2", role: "user", content: "second message" },
      );
      expect(generateConversationTitleFromTree(map, leafId)).toBe("first message");
    });

    it("ignores assistant messages that come before the first user message", () => {
      // assistant が path 先頭にあっても、それは無視して次の user を採用する。
      // Pin the role filter so a `=== "assistant"` mutation surfaces.
      const { map, leafId } = chain(
        { id: "a0", role: "assistant", content: "system-ish prelude" },
        { id: "u1", role: "user", content: "real prompt" },
      );
      expect(generateConversationTitleFromTree(map, leafId)).toBe("real prompt");
    });
  });

  describe("truncation boundary at 50 characters", () => {
    it("returns the content verbatim when it is shorter than 50 chars", () => {
      const { map, leafId } = chain({ id: "u", role: "user", content: "short prompt" });
      expect(generateConversationTitleFromTree(map, leafId)).toBe("short prompt");
    });

    it("returns the content verbatim when it is EXACTLY 50 chars (no ellipsis)", () => {
      // 境界 50 文字ちょうどでは省略記号を付けない。`text.length < content.length` 経路を検証する。
      // Kills the `<` → `<=` mutation at the 50-char boundary by asserting no "..." is appended.
      const fifty = "a".repeat(50);
      const { map, leafId } = chain({ id: "u", role: "user", content: fifty });
      const out = generateConversationTitleFromTree(map, leafId);
      expect(out).toBe(fifty);
      expect(out.endsWith("...")).toBe(false);
      expect(out.length).toBe(50);
    });

    it("appends '...' and truncates at 50 chars when content is 51 chars", () => {
      // 境界の 1 文字超え (51 文字) で初めて省略記号が付く。
      // Pin the just-over-boundary case so a `<` → `>` mutation flips behavior visibly.
      const fiftyOne = "b".repeat(51);
      const { map, leafId } = chain({ id: "u", role: "user", content: fiftyOne });
      const out = generateConversationTitleFromTree(map, leafId);
      expect(out).toBe(`${"b".repeat(50)}...`);
      expect(out.length).toBe(53);
    });

    it("truncates at 50 chars and appends exactly '...' for long content", () => {
      // 50 文字に切り詰め、末尾はちょうど "..." (3 文字)。
      // Pin both the slice length and the literal ellipsis suffix.
      const long = "0123456789".repeat(10); // 100 chars
      const { map, leafId } = chain({ id: "u", role: "user", content: long });
      const out = generateConversationTitleFromTree(map, leafId);
      expect(out).toBe(`${long.slice(0, 50)}...`);
      expect(out.endsWith("...")).toBe(true);
      expect(out.length).toBe(53);
    });

    it("uses character-based slicing (not byte-based) for multibyte content", () => {
      // 日本語のような multibyte 文字でも文字数 50 で切る（バイト数ではない）。
      // Pin character semantics; `slice` is code-unit-based, not byte-based.
      const fifty = "あ".repeat(50);
      const { map, leafId } = chain({ id: "u", role: "user", content: fifty });
      expect(generateConversationTitleFromTree(map, leafId)).toBe(fifty);

      const fiftyOne = "あ".repeat(51);
      const { map: m2, leafId: l2 } = chain({ id: "u", role: "user", content: fiftyOne });
      expect(generateConversationTitleFromTree(m2, l2)).toBe(`${"あ".repeat(50)}...`);
    });

    it("returns empty string verbatim when first user content is empty", () => {
      // 空文字 user content の場合、slice(0,50) も "" で、length 比較も等しく省略しない。
      // Pin that an empty user content yields `""` (no spurious "..." gets appended).
      const { map, leafId } = chain({ id: "u", role: "user", content: "" });
      expect(generateConversationTitleFromTree(map, leafId)).toBe("");
    });
  });
});
