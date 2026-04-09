import { useEffect } from "react";
import type { Editor } from "@tiptap/core";

/**
 * マークダウンらしいテキストかどうかを簡易判定する。
 * Heuristically checks whether the given text looks like markdown.
 *
 * @param text - 判定対象テキスト / Text to check
 * @returns マークダウンの特徴が含まれていれば true / true if markdown patterns are detected
 */
function looksLikeMarkdown(text: string): boolean {
  // 見出し / Headings: # / ## / ###
  if (/^#{1,6}\s/m.test(text)) return true;
  // リスト / Unordered lists: - item / * item
  if (/^[\t ]*[-*+]\s/m.test(text)) return true;
  // 番号付きリスト / Ordered lists: 1. item
  if (/^[\t ]*\d+\.\s/m.test(text)) return true;
  // コードブロック / Fenced code blocks (up to 3 leading spaces per CommonMark)
  if (/^[\t ]{0,3}```/m.test(text)) return true;
  // 引用 / Blockquotes: > text
  if (/^>\s/m.test(text)) return true;
  // 太字（`**`, `__`）のみ検出（単独の `*` / `_` は誤検知しやすいため除外）
  // Bold only (`**`, `__`); single `*` / `_` omitted due to false positives (filenames, etc.)
  if (/\*\*.+?\*\*|__.+?__/.test(text)) return true;
  // タスクリスト / Task lists: - [ ] / - [x]
  if (/^[\t ]*[-*+]\s\[[ xX]\]/m.test(text)) return true;
  // テーブル / Tables: | col | col |
  if (/^\|.+\|$/m.test(text) && /^\|[-:| ]+\|$/m.test(text)) return true;
  // リンク / Links: [text](url)
  if (/\[.+?\]\(.+?\)/.test(text)) return true;

  return false;
}

interface UseMarkdownPasteHandlerParams {
  editor: Editor | null;
}

/**
 * ペースト時にマークダウンテキストを検出し、リッチコンテンツとして挿入するフック。
 * Hook that detects pasted markdown text and inserts it as rich content.
 *
 * @param params - エディタインスタンス / Editor instance
 */
export function useMarkdownPasteHandler({ editor }: UseMarkdownPasteHandlerParams) {
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      // 同一要素に複数の paste リスナーがあると、先に登録されたハンドラが preventDefault しても
      // 後続リスナーは呼ばれる。画像 URL などで別ハンドラが処理済みならスキップする。
      // Multiple listeners on the same element: later listeners still run after preventDefault.
      // Skip when another handler already handled the paste (e.g. image URL paste).
      if (event.defaultPrevented) return;

      const text = event.clipboardData?.getData("text/plain");
      if (!text || !looksLikeMarkdown(text)) return;

      // @tiptap/markdown が提供する parse メソッドを使用
      // Use the parse method provided by @tiptap/markdown
      if (!editor.markdown) return;

      try {
        const parsed = editor.markdown.parse(text);
        event.preventDefault();
        editor.commands.insertContent(parsed);
      } catch {
        // パース失敗時は TipTap のデフォルトペースト処理にフォールバック
        // On parse failure, fall back to TipTap's default paste handling
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("paste", handlePaste);

    return () => {
      editorElement.removeEventListener("paste", handlePaste);
    };
  }, [editor]);
}
