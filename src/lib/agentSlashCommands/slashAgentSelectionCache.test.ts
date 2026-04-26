/**
 * Tests for the per-editor selection cache used by `/explain`.
 * `/explain` 用に選択テキストを保持するキャッシュのテスト。
 */

import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import {
  clearLastSlashAgentSelection,
  getLastSlashAgentSelection,
  rememberSlashAgentSelection,
} from "./slashAgentSelectionCache";

/**
 * Builds an editor mock whose `state.selection` and `doc.textBetween` reflect
 * the supplied range/text. WeakMap lookups need a real, stable object identity.
 * 範囲とテキストを反映するエディタモックを作る（WeakMap キーには安定オブジェクトが必要）。
 */
function makeMockEditor(opts: { from: number; to: number; text?: string }): Editor {
  return {
    state: {
      selection: { from: opts.from, to: opts.to },
      doc: { textBetween: vi.fn(() => opts.text ?? "") },
    },
  } as unknown as Editor;
}

describe("slashAgentSelectionCache", () => {
  it("returns empty when nothing is cached", () => {
    const editor = makeMockEditor({ from: 0, to: 0 });
    expect(getLastSlashAgentSelection(editor)).toBe("");
  });

  it("does not cache when the selection is collapsed", () => {
    const editor = makeMockEditor({ from: 4, to: 4, text: "ignored" });
    rememberSlashAgentSelection(editor);
    expect(getLastSlashAgentSelection(editor)).toBe("");
    // 折りたたみ選択では textBetween を呼ばないこと。
    // textBetween must not be called for a collapsed selection.
    expect(editor.state.doc.textBetween).not.toHaveBeenCalled();
  });

  it("caches the selection text for the next read", () => {
    const editor = makeMockEditor({ from: 1, to: 6, text: "hello" });
    rememberSlashAgentSelection(editor);
    expect(getLastSlashAgentSelection(editor)).toBe("hello");
    expect(editor.state.doc.textBetween).toHaveBeenCalledWith(1, 6, "\n", "￼");
  });

  it("overwrites the cached value with the most recent non-empty selection", () => {
    const editor = makeMockEditor({ from: 1, to: 4, text: "old" });
    rememberSlashAgentSelection(editor);
    expect(getLastSlashAgentSelection(editor)).toBe("old");

    (editor as unknown as { state: { selection: { from: number; to: number } } }).state.selection =
      { from: 5, to: 9 };
    (editor.state.doc.textBetween as ReturnType<typeof vi.fn>).mockReturnValueOnce("new");
    rememberSlashAgentSelection(editor);
    expect(getLastSlashAgentSelection(editor)).toBe("new");
  });

  it("scopes cached selections per editor instance", () => {
    const a = makeMockEditor({ from: 1, to: 3, text: "A" });
    const b = makeMockEditor({ from: 2, to: 7, text: "B" });
    rememberSlashAgentSelection(a);
    rememberSlashAgentSelection(b);
    expect(getLastSlashAgentSelection(a)).toBe("A");
    expect(getLastSlashAgentSelection(b)).toBe("B");
  });

  it("clears the cache for a single editor without affecting others", () => {
    const a = makeMockEditor({ from: 1, to: 3, text: "A" });
    const b = makeMockEditor({ from: 2, to: 7, text: "B" });
    rememberSlashAgentSelection(a);
    rememberSlashAgentSelection(b);

    clearLastSlashAgentSelection(a);
    expect(getLastSlashAgentSelection(a)).toBe("");
    expect(getLastSlashAgentSelection(b)).toBe("B");
  });
});
