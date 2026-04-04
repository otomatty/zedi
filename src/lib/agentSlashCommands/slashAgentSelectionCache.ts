/**
 * Remembers the last non-empty editor selection for agent slash `/explain`.
 * スラッシュ入力で選択が消える前のテキストを保持する（`/explain` 向け）。
 *
 * The slash menu only activates with a collapsed selection, so live
 * `getEditorSelectionText` is often empty when the command runs.
 * スラッシュメニューはキャレット時のみ有効のため、実行時点では選択テキストが空になりがち。
 */

import type { Editor } from "@tiptap/core";

const lastNonEmptyByEditor = new WeakMap<Editor, string>();

/**
 * Updates cached selection text when the user has a non-empty range.
 * 非空の選択があるときだけキャッシュを更新する。
 */
export function rememberSlashAgentSelection(editor: Editor): void {
  const { from, to } = editor.state.selection;
  if (from !== to) {
    lastNonEmptyByEditor.set(editor, editor.state.doc.textBetween(from, to, "\n", "\ufffc"));
  }
}

/**
 * Returns the last remembered non-empty selection text, or empty string.
 * 直前の非空選択テキストを返す（なければ空）。
 */
export function getLastSlashAgentSelection(editor: Editor): string {
  return lastNonEmptyByEditor.get(editor) ?? "";
}

/**
 * Clears the remembered selection for this editor (e.g. after `/explain` runs).
 * エディタのキャッシュを消す（`/explain` 完了後など）。
 */
export function clearLastSlashAgentSelection(editor: Editor): void {
  lastNonEmptyByEditor.delete(editor);
}
