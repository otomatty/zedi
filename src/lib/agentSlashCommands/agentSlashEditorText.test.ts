/**
 * Tests for plain-text / selection-text helpers used by agent slash commands.
 * エージェントスラッシュ用のテキスト取得ヘルパーのテスト。
 */

import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { getEditorPlainText, getEditorSelectionText } from "./agentSlashEditorText";

describe("getEditorPlainText", () => {
  it("requests text from Tiptap with a newline block separator", () => {
    const getText = vi.fn(() => "line1\nline2");
    const editor = { getText } as unknown as Editor;

    expect(getEditorPlainText(editor)).toBe("line1\nline2");
    expect(getText).toHaveBeenCalledWith({ blockSeparator: "\n" });
  });

  it("returns whatever Tiptap returns, including empty strings", () => {
    const editor = { getText: vi.fn(() => "") } as unknown as Editor;
    expect(getEditorPlainText(editor)).toBe("");
  });
});

describe("getEditorSelectionText", () => {
  it("returns empty when the selection is collapsed", () => {
    const textBetween = vi.fn();
    const editor = {
      state: {
        selection: { from: 5, to: 5 },
        doc: { textBetween },
      },
    } as unknown as Editor;

    expect(getEditorSelectionText(editor)).toBe("");
    // 折りたたみ選択では textBetween を呼ばない（不要な計算を避ける）。
    // No call to textBetween for a collapsed selection — avoids wasted work.
    expect(textBetween).not.toHaveBeenCalled();
  });

  it("delegates to doc.textBetween with a newline block separator and U+FFFC leaf marker", () => {
    const textBetween = vi.fn(() => "abc");
    const editor = {
      state: {
        selection: { from: 2, to: 7 },
        doc: { textBetween },
      },
    } as unknown as Editor;

    expect(getEditorSelectionText(editor)).toBe("abc");
    // U+FFFC (object replacement char) はノード代替の標準プレースホルダ。
    // U+FFFC is the standard placeholder used for node replacements in ProseMirror.
    expect(textBetween).toHaveBeenCalledWith(2, 7, "\n", "￼");
  });
});
