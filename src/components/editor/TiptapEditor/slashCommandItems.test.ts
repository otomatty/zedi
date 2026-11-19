/**
 * slashCommandItems: filtering, availability, and heading-level alignment.
 * slashCommandItems: フィルタリング、可用性判定、見出しレベル整合。
 */

import { describe, it, expect, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { slashCommandItems, filterSlashCommandItems } from "./slashCommandItems";

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  },
}));

/**
 * 全 Tiptap 拡張が登録されている想定のスタブエディタを返す。
 * Returns a stub editor that pretends every Tiptap extension is registered.
 */
function makeEditorWithAllExtensions(): Editor {
  const extensions = [
    { name: "taskList" },
    { name: "table" },
    { name: "mermaid" },
    { name: "mathematics" },
    { name: "htmlArtifact" },
  ];
  return {
    extensionManager: { extensions },
  } as unknown as Editor;
}

const tFunction = (key: string) => key;

describe("slashCommandItems availability", () => {
  it("never offers the blocks removed with the desktop app", () => {
    const editor = makeEditorWithAllExtensions();
    const ids = filterSlashCommandItems(slashCommandItems, "", editor, tFunction).map((i) => i.id);

    expect(ids).not.toContain("executableCodeBlock");
    expect(ids).not.toContain("mcpResource");
  });

  it("offers the web blocks", () => {
    const editor = makeEditorWithAllExtensions();
    const ids = filterSlashCommandItems(slashCommandItems, "", editor, tFunction).map((i) => i.id);

    expect(ids).toContain("paragraph");
    expect(ids).toContain("heading2");
    expect(ids).toContain("table");
    expect(ids).toContain("mermaid");
  });
});

describe("slashCommandItems heading entries", () => {
  /**
   * Slash menu の見出し ID は実 level と 1:1 で対応していなければならない
   * (PR #777 で本文 schema が `levels: [2, 3, 4, 5]` に変わったため)。
   * Slash menu heading IDs must map 1:1 to the real schema level
   * (the body editor restricts headings to `levels: [2, 3, 4, 5]` since PR #777).
   */
  it("exposes heading2 through heading5 with matching levels and no legacy heading1", () => {
    const ids = slashCommandItems.map((i) => i.id);

    expect(ids).not.toContain("heading1");
    expect(ids).toContain("heading2");
    expect(ids).toContain("heading3");
    expect(ids).toContain("heading4");
    expect(ids).toContain("heading5");

    const captured: { level?: number } = {};
    const chain = {
      focus: () => chain,
      deleteRange: () => chain,
      setHeading: (attrs: { level: number }) => {
        captured.level = attrs.level;
        return chain;
      },
      run: () => true,
    };
    const editorStub = {
      chain: () => chain,
    } as unknown as Editor;

    for (const level of [2, 3, 4, 5] as const) {
      const item = slashCommandItems.find((i) => i.id === `heading${level}`);
      expect(item).toBeDefined();
      captured.level = undefined;
      item?.action(editorStub, { from: 0, to: 0 });
      expect(captured.level).toBe(level);
    }
  });
});
