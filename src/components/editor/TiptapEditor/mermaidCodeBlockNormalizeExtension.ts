import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * `MermaidCodeBlockNormalize` のプラグインキー。拡張再初期化のたびに
 * `PluginKey` を作り直さないようトップレベルで定義する。
 *
 * Plugin key for `MermaidCodeBlockNormalize`. Declared at module scope so it
 * is stable across extension re-initialisations.
 */
const mermaidCodeBlockNormalizeKey = new PluginKey("mermaidCodeBlockNormalize");

/**
 * ノード型名が `codeBlock`（または互換の `code_block`）かを判定する。
 * Returns whether a ProseMirror node type name represents a code block.
 */
function isCodeBlockType(typeName: string): boolean {
  return typeName === "codeBlock" || typeName === "code_block";
}

/**
 * 与えられたノードの `language` 属性が `"mermaid"`（大文字小文字無視）かを判定する。
 * Returns whether the node's `language` attribute selects the Mermaid renderer.
 */
function isMermaidLanguage(attrs: Record<string, unknown> | null | undefined): boolean {
  const value = attrs?.language;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "mermaid";
}

/**
 * `state.doc` を 1 度走査し、`language: "mermaid"` の codeBlock を `mermaid`
 * ノードに置換するトランザクションを構築する。対象がなければ `null` を返す。
 *
 * Walk the document once and build a transaction that replaces every
 * `codeBlock` with `language: "mermaid"` by a dedicated `mermaid` node.
 * Returns `null` when nothing needs to change so the caller can skip dispatch.
 *
 * 走査は降順 (`-pos`) で置換することにより、先に置換した範囲のオフセット変動が
 * 後続の置換位置に影響しないようにしている（Issue #945）。
 *
 * Replacements are applied in descending document order so that splicing
 * earlier in the tree does not invalidate the positions of later targets
 * (Issue #945).
 *
 * @param state - 走査対象のエディタ状態 / Editor state to scan.
 * @returns 変換トランザクション、または変換不要なら null / Transaction or `null`.
 */
function buildMermaidNormalizeTr(state: EditorState): Transaction | null {
  const mermaidType = state.schema.nodes.mermaid;
  // mermaid ノードがスキーマに存在しない（プレビュー用拡張セット等）場合は何もしない。
  // Bail out gracefully when the `mermaid` node is not part of the schema
  // (e.g. lightweight preview extension sets).
  if (!mermaidType) return null;

  type Target = { pos: number; nodeSize: number; code: string };
  const targets: Target[] = [];

  state.doc.descendants((node, pos) => {
    if (!isCodeBlockType(node.type.name)) {
      // 内部に codeBlock がさらに入れ子になることは無いが、ネストブロック（list 等）の
      // 走査を続けるため true を返す。
      // Continue descending into other block types (lists, tables, etc.).
      return true;
    }
    if (!isMermaidLanguage(node.attrs)) {
      // 非 mermaid の codeBlock 配下にはこれ以上探す対象がない。
      // No mermaid targets nest inside non-mermaid code blocks.
      return false;
    }
    targets.push({ pos, nodeSize: node.nodeSize, code: node.textContent });
    return false;
  });

  if (targets.length === 0) return null;

  let tr: Transaction | null = null;
  // 末尾から置換することでオフセットの巻き戻りを避ける。
  // Replace from the end backwards to keep positions stable across edits.
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    const { pos, nodeSize, code } = targets[i];
    // 末尾の改行は描画時のノイズになるため除去する（pasted/imported source も同様）。
    // Strip trailing newlines so the rendered diagram does not have stray
    // whitespace, matching the paste-side `transformMermaidCodeBlocksInContent`.
    const trimmedCode = code.replace(/\n+$/u, "");
    const mermaidNode = mermaidType.create({ code: trimmedCode });
    tr ??= state.tr;
    tr.replaceWith(pos, pos + nodeSize, mermaidNode);
  }
  return tr;
}

/**
 * 既存ドキュメント内の Mermaid フェンス由来の `codeBlock` を、エディタ表示時に
 * `mermaid` ノードへ正規化する Tiptap 拡張。
 *
 * Tiptap extension that lazily migrates legacy `codeBlock` nodes with
 * `language: "mermaid"` to dedicated `mermaid` nodes. The transform runs once
 * on view mount (because the initial document does not always pass through
 * `appendTransaction`) and additionally on each transaction so that runtime
 * language changes (e.g. via the code-block language selector) also pick up
 * the conversion.
 *
 * Y.js 協調編集環境でも、変換トランザクションは通常のドキュメント編集として
 * 他クライアントへ同期される（意図した lazy migration）。
 *
 * Under Y.js collaborative editing the rewrite is a regular doc transaction
 * and therefore propagates to peers as expected.
 *
 * 参考: `HeadingLevelClamp`（`headingLevelClampExtension.ts`）。
 * See `HeadingLevelClamp` for the structural template (Issue #945).
 */
export const MermaidCodeBlockNormalize = Extension.create({
  name: "mermaidCodeBlockNormalize",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: mermaidCodeBlockNormalizeKey,
        view(view) {
          queueMicrotask(() => {
            if (view.isDestroyed) return;
            const tr = buildMermaidNormalizeTr(view.state);
            if (tr) {
              view.dispatch(tr);
            }
          });
          return {};
        },
        appendTransaction(transactions, _oldState, newState) {
          // `docChanged` の無いトランザクション（選択変更など）は対象外。
          // Skip transactions that don't touch the doc (selection-only changes).
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }
          return buildMermaidNormalizeTr(newState);
        },
      }),
    ];
  },
});
