/**
 * Markdown → Tiptap JSON 変換の共通モジュール。
 * wikiGenerator と aiChatActionHelpers の両方で利用。
 *
 * 見出しの方針:
 * - `# X` は **本文の見出しに変換しない**（ページの h1 はタイトル input が担うため、`# X` を
 *   書いた行はそのまま `# X` というテキストの paragraph として残す）。これにより、
 *   `markdownExport.ts` の `"#".repeat(level)` と round-trip が対称になる。
 * - `## / ### / #### / #####` → Tiptap level 2/3/4/5 にそれぞれ対応する。
 *
 * Heading policy:
 * - `# X` is **not** converted into a body heading; the page h1 lives in the title field, so
 *   any line starting with `# ` is preserved verbatim as a `# X` paragraph. This keeps the
 *   import side symmetric with `markdownExport.ts`'s `"#".repeat(level)` output.
 * - `## / ### / #### / #####` map to Tiptap heading levels 2/3/4/5 respectively.
 *
 * `dropLeadingH1` オプション:
 * - AI 生成 Markdown は本文先頭に `# {タイトル}` を出してしまうことがあり、ページタイトル
 *   input 側で h1 を持つ Zedi の方針とは重複する。AI 経由のコンバート（チャットアクション
 *   の append、Wiki 自動生成）では `dropLeadingH1: true` を渡し、先頭に現れた `# X`
 *   1 行のみを取り除く。人手入力経路は既定（false）のまま `# X` をリテラル paragraph
 *   として残し、`markdownExport.ts` との round-trip を保つ。
 *
 * `dropLeadingH1` option:
 * - AI-generated Markdown sometimes prefixes the body with `# {Title}`, which collides with
 *   Zedi's page-title input that already owns the document's only h1. AI-fed conversions
 *   (chat-action append, wiki auto-generation) should pass `dropLeadingH1: true` so the
 *   single leading `# X` line is stripped. Human-input paths keep the default (`false`) and
 *   preserve `# X` as a literal paragraph for round-trip symmetry with `markdownExport.ts`.
 */

import { parseInlineContent, type TiptapTextNode } from "./markdownToTiptapHelpers";

type TiptapBlockNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<TiptapBlockNode | TiptapTextNode>;
};

/**
 * Options for {@link convertMarkdownToTiptapContent}.
 * `convertMarkdownToTiptapContent` のオプション。
 */
export interface ConvertMarkdownToTiptapOptions {
  /**
   * AI 経路で先頭の `# X` 行 1 行のみを落とす（AI が誤ってタイトル行を本文に出した場合の救済）。
   * Drop a single leading `# X` line (used by AI paths to scrub a stray title heading).
   * 既定: `false`（人手入力では `# X` をリテラル paragraph として残す）。
   * Default: `false` (human input keeps `# X` as a literal paragraph).
   */
  dropLeadingH1?: boolean;
}

/**
 * 先頭の `# X` 1 行を取り除く（任意の先行空白行は許容、`## ...` などは対象外）。
 * Strip a single leading `# X` line, allowing optional leading whitespace-only lines.
 * `## ...` や本文中の `# X` には触れない。
 *
 * 入力は LF 正規化済み (`\n`) を想定する（呼び出し側で一度だけ正規化する）。
 * The input is expected to be LF-normalized (`\n`); the caller normalizes once.
 */
function stripLeadingH1Line(normalized: string): string {
  // `\s*` allows preceding blank/whitespace-only lines. The negative lookahead `(?!#)`
  // ensures we only match a single `#` (not `##`, `###`, ...). `[^\n]*` captures the
  // remainder of the heading line and the trailing `\n?` consumes its line break.
  const match = normalized.match(/^(\s*)# (?!#)[^\n]*\n?/);
  if (!match) return normalized;
  return normalized.slice(match[0].length);
}

/**
 * Markdown 文字列を Tiptap JSON（`doc`）へ変換し、文字列化して返す。
 * Convert a Markdown string to a Tiptap `doc` JSON and return its serialized form.
 *
 * @param markdown - 入力 Markdown / Source Markdown text.
 * @param options - 変換オプション / Conversion options.
 * @returns Tiptap doc JSON を `JSON.stringify` した文字列 / Serialized Tiptap doc JSON.
 */
export function convertMarkdownToTiptapContent(
  markdown: string,
  options?: ConvertMarkdownToTiptapOptions,
): string {
  // CRLF/CR を LF に正規化してから後続処理（H1 ストリップ、行分割）を一括で行う。
  // Normalize CRLF/CR to LF once, then run downstream steps (H1 strip, line split).
  let normalized = markdown.replace(/\r\n?/g, "\n");
  if (options?.dropLeadingH1) {
    normalized = stripLeadingH1Line(normalized);
  }
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  const doc: { type: "doc"; content: TiptapBlockNode[] } = {
    type: "doc",
    content: [],
  };

  for (const line of lines) {
    if (line.trim() === "") {
      doc.content.push({ type: "paragraph" });
      continue;
    }

    if (line.startsWith("##### ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 5 },
        content: parseInlineContent(line.slice(6)),
      });
      continue;
    }

    if (line.startsWith("#### ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 4 },
        content: parseInlineContent(line.slice(5)),
      });
      continue;
    }

    if (line.startsWith("### ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 3 },
        content: parseInlineContent(line.slice(4)),
      });
      continue;
    }

    if (line.startsWith("## ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 2 },
        content: parseInlineContent(line.slice(3)),
      });
      continue;
    }

    // `# X` は本文 h1 として変換しない: ページのタイトル input が h1 を担うため、
    // 該当行はそのまま `# X` というテキストを含む paragraph として残し、後段の
    // 既定パラグラフ分岐に委ねる。
    // `# X` is intentionally NOT converted into a body heading; the page title field is the
    // canonical h1, so the line falls through to the default paragraph branch and survives
    // verbatim as a `# X` text paragraph.

    if (line.startsWith("- ") || line.startsWith("* ")) {
      const listItem: TiptapBlockNode = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineContent(line.slice(2)),
          },
        ],
      };

      const lastNode = doc.content[doc.content.length - 1];
      if (lastNode?.type === "bulletList") {
        if (!lastNode.content) lastNode.content = [];
        lastNode.content.push(listItem);
      } else {
        doc.content.push({
          type: "bulletList",
          content: [listItem],
        });
      }
      continue;
    }

    doc.content.push({
      type: "paragraph",
      content: parseInlineContent(line),
    });
  }

  return JSON.stringify(doc);
}
