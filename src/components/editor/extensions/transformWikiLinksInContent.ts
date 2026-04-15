/**
 * 貼り付けテキスト内の `[[Title]]` 形式のWikiリンク記法を検出・変換するユーティリティ。
 * Utilities to detect and transform `[[Title]]` wiki link syntax inside pasted content.
 *
 * `@tiptap/markdown` はWikiリンク記法を解さずプレーンテキストとしてパースするため、
 * パース後の ProseMirror JSON を後処理して `wikiLink` マークを付与する必要がある。
 *
 * Since `@tiptap/markdown` treats `[[...]]` as plain text, we post-process the parsed
 * ProseMirror JSON and apply the `wikiLink` mark so the final inserted content renders
 * as proper wiki links.
 */

/**
 * テキスト中のWikiリンクにマッチする正規表現（グローバルフラグ）。
 * Regex matching wiki links inside text (global flag).
 *
 * `g` フラグ付きの共有インスタンスは `lastIndex` を持つため、使用時は毎回
 * `matchAll` で列挙するか、新しい `RegExp` を作成して副作用を避けること。
 */
export const WIKI_LINK_TEXT_REGEX = /\[\[([^[\]]+)\]\]/g;

/**
 * 単一マッチ用（lastIndex の副作用なし）。
 * Single-match variant without `g` flag (no `lastIndex` side effects).
 */
const WIKI_LINK_TEXT_TEST_REGEX = /\[\[([^[\]]+)\]\]/;

/**
 * 与えられた文字列にWikiリンクパターンが1つ以上含まれるか判定する。
 * Returns whether the given text contains at least one wiki link pattern.
 *
 * @param text - 判定対象のテキスト / Text to check
 * @returns Wikiリンクが含まれていれば true / true if at least one wiki link exists
 */
export function containsWikiLinkPattern(text: string): boolean {
  return WIKI_LINK_TEXT_TEST_REGEX.test(text);
}

/**
 * ProseMirror のマーク定義（最小限の構造）。
 * Minimal shape of a ProseMirror mark definition.
 */
interface MarkJSON {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * ProseMirror のノード定義（最小限の構造）。
 * Minimal shape of a ProseMirror node.
 */
interface NodeJSON {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: MarkJSON[];
  content?: NodeJSON[];
}

/**
 * 単一のテキストノードを、Wikiリンクマーク付きに分割変換する。
 * Split a text node into segments, applying the wikiLink mark to the matches.
 *
 * @param node - 変換対象のテキストノード / The text node to transform
 * @returns 分割後のノード配列（変換不要なら長さ1の配列）/ Resulting nodes (length 1 if unchanged)
 */
function splitTextNodeByWikiLinks(node: NodeJSON): NodeJSON[] {
  const text = node.text ?? "";
  if (!text || !containsWikiLinkPattern(text)) {
    return [node];
  }

  const result: NodeJSON[] = [];
  let cursor = 0;

  for (const match of text.matchAll(WIKI_LINK_TEXT_REGEX)) {
    const raw = match[1] ?? "";
    const title = raw.trim();
    const start = match.index ?? 0;
    const end = start + match[0].length;

    // 空タイトルは変換せずスキップ（プレーンテキストのまま残す）
    // Empty titles are skipped; the literal `[[   ]]` stays as plain text
    if (!title) {
      continue;
    }

    // マッチ前のプレーン部分を追加
    // Push the plain prefix before the match (if any)
    if (start > cursor) {
      result.push(buildTextNode(text.slice(cursor, start), node.marks));
    }

    // Wikiリンクマーク付きノードを追加
    // Push the wiki-linked text node
    const wikiMark: MarkJSON = {
      type: "wikiLink",
      attrs: { title, exists: false, referenced: false },
    };
    result.push(buildTextNode(title, mergeMarks(node.marks, wikiMark)));

    cursor = end;
  }

  // 末尾のプレーン部分
  // Trailing plain tail (if any)
  if (cursor < text.length) {
    result.push(buildTextNode(text.slice(cursor), node.marks));
  }

  // マッチはしたが全て空タイトルだった場合は元のノードを維持
  // If all matches had empty titles, keep the original node
  if (result.length === 0) {
    return [node];
  }

  return result;
}

/**
 * テキストノードを生成する（任意でマーク配列をコピーして付与）。
 * Build a text node, optionally copying a marks array.
 */
function buildTextNode(text: string, marks?: MarkJSON[]): NodeJSON {
  const node: NodeJSON = { type: "text", text };
  if (marks && marks.length > 0) {
    node.marks = marks.map((mark) => ({ ...mark }));
  }
  return node;
}

/**
 * 既存マーク配列と新規マークをマージして新しい配列を返す。
 * Merge an existing marks array with a new mark, returning a new array.
 */
function mergeMarks(existing: MarkJSON[] | undefined, extra: MarkJSON): MarkJSON[] {
  if (!existing || existing.length === 0) {
    return [extra];
  }
  return [...existing, extra];
}

/**
 * コードとして扱うノード種別かを返す。
 * Returns whether the given parent node type should preserve literal code text.
 */
function isCodeContainerType(type: string): boolean {
  return type === "codeBlock" || type === "code_block";
}

/**
 * 任意のノードを再帰的に変換する（テキストノードのみWikiリンク変換を適用）。
 * Recursively transform a node; wiki link extraction only applies to text nodes.
 */
function transformNode(node: NodeJSON): NodeJSON {
  if (node.type === "text") {
    // テキストノードはここでは単独では分割できない（親の content 配列で差し替える必要あり）
    // Text node splitting is handled by the parent via transformChildren.
    return node;
  }

  if (!node.content || node.content.length === 0) {
    return node;
  }

  const newContent: NodeJSON[] = [];
  for (const child of node.content) {
    const isLiteralCodeText =
      child.type === "text" &&
      (isCodeContainerType(node.type) || child.marks?.some((mark) => mark.type === "code"));
    if (child.type === "text" && !isLiteralCodeText) {
      newContent.push(...splitTextNodeByWikiLinks(child));
    } else {
      newContent.push(transformNode(child));
    }
  }

  return { ...node, content: newContent };
}

/**
 * ProseMirror JSON ドキュメント内のテキストノードに含まれる `[[Title]]` パターンを
 * 走査し、`wikiLink` マーク付きのテキストノードに変換して返す。
 *
 * Walk a ProseMirror JSON document, replacing `[[Title]]` patterns inside text nodes
 * with text nodes carrying the `wikiLink` mark. Input is never mutated.
 *
 * @param content - `editor.markdown.parse()` 等で得たドキュメントJSON
 *                  The document JSON returned by e.g. `editor.markdown.parse()`
 * @returns 変換後のドキュメントJSON（入力は不変）/ Transformed document JSON (input untouched)
 */
export function transformWikiLinksInContent<T extends NodeJSON>(content: T): T {
  // 入力を不変に保つためディープクローン
  // Deep-clone to keep the input immutable
  const cloned = JSON.parse(JSON.stringify(content)) as T;
  return transformNode(cloned) as T;
}
