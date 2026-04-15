import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  containsWikiLinkPattern,
  transformWikiLinksInContent,
} from "./transformWikiLinksInContent";

/**
 * ProseMirror プラグインキー（拡張再初期化時の再生成を避けるためトップレベルで定義）。
 * Top-level PluginKey to avoid re-creation on extension re-initialisation.
 */
const markdownPasteKey = new PluginKey("markdownPaste");

/**
 * マークダウンらしいテキストかどうかを簡易判定する。
 * Heuristically checks whether the given text looks like markdown.
 *
 * @param text - 判定対象テキスト / Text to check
 * @returns マークダウンの特徴が含まれていれば true / true if markdown patterns are detected
 */
export function looksLikeMarkdown(text: string): boolean {
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

/**
 * ペースト時にマークダウンテキストを検出し、リッチコンテンツとして挿入する Tiptap 拡張。
 * ProseMirror の handlePaste プラグインとして動作するため、デフォルトのプレーンテキスト
 * 挿入よりも先に実行される。
 *
 * Tiptap extension that detects pasted markdown text and inserts it as rich content.
 * Works as a ProseMirror handlePaste plugin, so it runs before the default plain-text insertion.
 */
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: markdownPasteKey,
        props: {
          handlePaste(_view, event, _slice) {
            if (!editor.isEditable) return false;

            const text = event.clipboardData?.getData("text/plain");
            if (!text) return false;

            // マークダウン記法または Wikiリンク記法のいずれかが含まれる場合のみ介入する。
            // Intercept only when markdown patterns OR wiki link syntax are detected.
            const hasMarkdown = looksLikeMarkdown(text);
            const hasWikiLink = containsWikiLinkPattern(text);
            if (!hasMarkdown && !hasWikiLink) return false;

            if (!editor.markdown) return false;

            try {
              const parsed = editor.markdown.parse(text);
              // Wikiリンクは @tiptap/markdown がプレーンテキストとしてパースするため、
              // 後処理で `wikiLink` マークを付与する。
              // `@tiptap/markdown` leaves `[[...]]` as plain text, so post-process
              // the parsed JSON to apply the `wikiLink` mark.
              const content = hasWikiLink
                ? transformWikiLinksInContent(
                    parsed as Parameters<typeof transformWikiLinksInContent>[0],
                  )
                : parsed;
              return editor.commands.insertContent(content);
            } catch {
              // パース失敗時は ProseMirror のデフォルトペースト処理にフォールバック
              // On parse failure, fall back to ProseMirror's default paste handling
              return false;
            }
          },
        },
      }),
    ];
  },
});
