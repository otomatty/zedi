/**
 * Markdown のフェンス言語 `mermaid` で書かれたコードブロック（Tiptap JSON 上では
 * `codeBlock` + `attrs.language === "mermaid"`）を、専用の `mermaid` ノードに
 * 変換するためのユーティリティ。
 *
 * Utility that converts Markdown fenced code blocks tagged with the language
 * identifier `mermaid` (represented as `codeBlock` nodes with
 * `attrs.language === "mermaid"` in the Tiptap JSON tree) into dedicated
 * `mermaid` nodes so they render as SVG diagrams via the existing
 * `MermaidNodeView`.
 *
 * `@tiptap/markdown` はフェンス言語にかかわらず `codeBlock` を生成するため、
 * Wiki リンクの後処理（`transformWikiLinksInContent`）と同様に、パース後の
 * ProseMirror JSON を走査して該当ノードを差し替える。
 *
 * Since `@tiptap/markdown` always produces a `codeBlock` regardless of fence
 * language, we post-process the parsed ProseMirror JSON—mirroring the pattern
 * used by `transformWikiLinksInContent`—and replace matching code blocks with
 * `mermaid` nodes.
 */

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
 * 与えられたコードブロックノードの `language` 属性が "mermaid" を示すかを判定する。
 * 大文字小文字を無視（`"Mermaid"` / `"MERMAID"` も対象）し、前後の空白はトリムする。
 *
 * Returns whether a code block node's `language` attribute refers to mermaid.
 * The comparison is case-insensitive (so `"Mermaid"` / `"MERMAID"` also match)
 * and surrounding whitespace is trimmed.
 *
 * @param attrs - codeBlock ノードの属性 / Attributes of the codeBlock node.
 */
function isMermaidLanguage(attrs: Record<string, unknown> | undefined): boolean {
  const language = attrs?.language;
  if (typeof language !== "string") return false;
  return language.trim().toLowerCase() === "mermaid";
}

/**
 * ノード配列内の `text` ノードを連結して 1 つの文字列にする。
 * Mermaid のソースコードは複数の `text` ノードに分かれている場合があるため、
 * `hardBreak` を改行に展開しつつ平坦化する。
 *
 * Concatenate the textual content of a node's children. Mermaid source code
 * may be split across multiple `text` nodes; `hardBreak` nodes are expanded
 * to newlines so the resulting string is suitable as raw Mermaid source.
 *
 * @param nodes - 抽出対象のノード配列 / Child nodes to flatten.
 * @returns 連結したテキスト / The concatenated text.
 */
function extractCodeText(nodes: NodeJSON[] | undefined): string {
  if (!nodes || nodes.length === 0) return "";
  let result = "";
  for (const node of nodes) {
    if (node.type === "text") {
      result += node.text ?? "";
      continue;
    }
    if (node.type === "hardBreak") {
      result += "\n";
      continue;
    }
    if (node.content && node.content.length > 0) {
      result += extractCodeText(node.content);
    }
  }
  return result;
}

/**
 * 1 つのノードに対して、Mermaid コードブロックを `mermaid` ノードに置換する。
 * テキスト末尾の改行は表示時のノイズになるため削除する。子ノードに変更が
 * 無い場合は同一参照を返し、構造共有によって不要な配列・オブジェクト生成を
 * 避ける（入力は不変）。
 *
 * Replace a `codeBlock` with `language: "mermaid"` by an equivalent `mermaid`
 * node, or recurse into the node's children otherwise. Trailing newlines in
 * the extracted source are stripped because Mermaid does not require them and
 * they would otherwise leak into the rendered diagram's caption area. The
 * function returns the original reference whenever no descendant was rewritten,
 * which lets callers rely on referential equality to detect changes and avoids
 * unnecessary allocations (the input is never mutated either way).
 *
 * @param node - 走査対象のノード / The node to inspect.
 * @returns 変換後のノード / The (possibly transformed) node.
 */
function transformNode(node: NodeJSON): NodeJSON {
  if ((node.type === "codeBlock" || node.type === "code_block") && isMermaidLanguage(node.attrs)) {
    const code = extractCodeText(node.content).replace(/\n+$/u, "");
    return {
      type: "mermaid",
      attrs: { code },
    };
  }

  const content = node.content;
  if (!content || content.length === 0) {
    return node;
  }

  let changedContent: NodeJSON[] | null = null;
  for (let i = 0; i < content.length; i += 1) {
    const child = content[i];
    const transformed = transformNode(child);
    if (transformed !== child) {
      // 最初の変更を検出した時点で配列を複製し、先行する未変更ノードをコピーする。
      // Lazily clone the array on the first change, preserving prior children.
      if (!changedContent) {
        changedContent = content.slice(0, i);
      }
      changedContent.push(transformed);
    } else if (changedContent) {
      changedContent.push(child);
    }
  }

  return changedContent ? { ...node, content: changedContent } : node;
}

/**
 * ProseMirror JSON ドキュメント全体を走査し、`language === "mermaid"` の
 * コードブロックを `mermaid` ノードに置換した新しいドキュメントを返す。
 * 入力は不変。変換対象が無い場合は同一参照を返す。
 *
 * Walk a ProseMirror JSON document, replacing every `codeBlock` whose
 * `language` is `"mermaid"` (case-insensitive) with a `mermaid` node so it
 * renders as a diagram. The input is not mutated. When no mermaid block is
 * found, the original reference is returned unchanged—`transformNode` only
 * allocates along the path of actual changes, so large pasted/loaded docs
 * without diagrams incur zero copying.
 *
 * @param content - `editor.markdown.parse()` などで得た ProseMirror JSON。
 *                  Document JSON produced by e.g. `editor.markdown.parse()`.
 * @returns 変換後の JSON（入力は不変）/ Transformed JSON (input untouched).
 */
export function transformMermaidCodeBlocksInContent<T extends NodeJSON>(content: T): T {
  return transformNode(content) as T;
}

/**
 * テキストに `mermaid` フェンスらしき記法が含まれているか軽量に判定する。
 * `MarkdownPasteExtension` で「Mermaid 変換を試みるべきか」のショートカット判定に使う。
 *
 * Lightweight predicate that tells whether a string contains a fenced
 * code block whose info string starts with `mermaid` (case-insensitive). Used
 * by `MarkdownPasteExtension` as a fast pre-check before running the full
 * post-parse transform.
 *
 * @param text - 判定対象のテキスト / Text to inspect.
 * @returns Mermaid フェンスが含まれていれば true / true if a mermaid fence is present.
 */
export function containsMermaidFence(text: string): boolean {
  return /^[\t ]{0,3}```[\t ]*mermaid\b/im.test(text);
}
