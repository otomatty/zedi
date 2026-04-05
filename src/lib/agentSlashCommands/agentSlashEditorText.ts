/**
 * Reads plain text from the Tiptap editor for agent slash prompts.
 * エージェントスラッシュ用に Tiptap からプレーンテキストを読む。
 */

import type { Editor } from "@tiptap/core";

/**
 * Collects plain text from the editor for summarization.
 * 要約用にエディタからプレーンテキストを取得する。
 */
export function getEditorPlainText(editor: Editor): string {
  return editor.getText({ blockSeparator: "\n" });
}

/**
 * Returns the current selection as plain text, or empty if collapsed.
 * 選択範囲のプレーンテキスト。折りたたみなら空。
 */
export function getEditorSelectionText(editor: Editor): string {
  const { from, to } = editor.state.selection;
  if (from === to) return "";
  return editor.state.doc.textBetween(from, to, "\n", "\ufffc");
}
