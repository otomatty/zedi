import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";

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
  // コードブロック / Fenced code blocks: ```
  if (/^```/m.test(text)) return true;
  // 引用 / Blockquotes: > text
  if (/^>\s/m.test(text)) return true;
  // 太字・斜体 / Bold/italic: **text** / *text* / __text__ / _text_
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
      // HTML が含まれている場合はリッチペーストを優先（他アプリからのコピーなど）
      // If HTML is present, let TipTap handle it as rich paste (e.g., copy from other apps)
      const html = event.clipboardData?.getData("text/html");
      if (html) return;

      const text = event.clipboardData?.getData("text/plain");
      if (!text || !looksLikeMarkdown(text)) return;

      // @tiptap/markdown が提供する parse メソッドを使用
      // Use the parse method provided by @tiptap/markdown
      if (!editor.markdown) return;

      event.preventDefault();

      const parsed = editor.markdown.parse(text);
      const doc = editor.state.schema.nodeFromJSON(parsed);
      const slice = new Slice(doc.content, 0, 0);

      const tr = editor.view.state.tr.replaceSelection(slice);
      editor.view.dispatch(tr);
    };

    const editorElement = editor.view.dom;
    // usePasteImageHandler よりも後に登録されるため、画像ペーストが先に処理される
    // Registered after usePasteImageHandler, so image paste is processed first
    editorElement.addEventListener("paste", handlePaste);

    return () => {
      editorElement.removeEventListener("paste", handlePaste);
    };
  }, [editor]);
}
