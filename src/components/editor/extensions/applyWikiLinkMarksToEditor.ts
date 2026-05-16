/**
 * Hocuspocus からロードされた既存 Y.Doc 上で、まだ `wikiLink` mark になっていない
 * `[[Title]]` プレーンテキストを wikiLink mark に昇格させる正規化ヘルパー。
 * Issue #880 の Phase B（初期同期後の mark 化）で導入。
 *
 * Post-initial-sync normalizer that promotes plain `[[Title]]` text to
 * `wikiLink` marks inside a Tiptap editor bound to a Hocuspocus-backed Y.Doc.
 * Introduced for issue #880 Phase B.
 *
 * 設計方針 / Design notes:
 * - `editor.commands.setContent()` を使わない。collaborative mode では Y.Doc が
 *   editor の状態源なので、setContent は Y.Doc を捨てて再構築してしまい、初期
 *   同期で得た既存コンテンツを失う。ここではプレーンテキストをスキャンし、
 *   ProseMirror transaction で `addMark` のみ呼ぶ（テキスト構造は変えない）。
 * - 二重 mark 化を防ぐため、既に `wikiLink` mark が付いた text node はスキップ。
 * - `code` mark や `codeBlock` / `executableCodeBlock` 親の text はスキップする
 *   (`transformWikiLinksInContent` の契約と同じ)。
 * - mark 適用は単一トランザクションで一括適用する。`addMark` はテキストの
 *   位置を変えないため、順序は安全。
 *
 * - Avoid `editor.commands.setContent()` — in collaborative mode that would
 *   wipe the Y.Doc and lose the just-synced content. We mutate marks in place
 *   via a ProseMirror transaction (`addMark`), which does not change text
 *   positions.
 * - Skip text nodes that already carry a `wikiLink` mark (no double-marking).
 * - Skip code-block / inline-code text, mirroring the contract of
 *   `transformWikiLinksInContent` (paste-time normalizer).
 * - All marks are applied in one transaction so subscribers see a single
 *   update.
 */

import type { Editor } from "@tiptap/core";

/**
 * テキスト中の `[[Title]]` パターンを列挙する正規表現（global）。
 * 共有しないために関数内で都度 `new RegExp` する設計の方が安全だが、ここでは
 * `matchAll` のみで使うため副作用は出ない。
 *
 * Pattern matching `[[Title]]` in plain text. Used only with `matchAll`, so
 * the global flag's `lastIndex` side effects do not leak.
 */
const WIKI_LINK_TEXT_REGEX = /\[\[([^[\]]+)\]\]/g;

/** Tiptap がコードとして扱うブロックノード型集合。 / Tiptap code-container node types. */
const CODE_CONTAINER_TYPES = new Set<string>(["codeBlock", "code_block", "executableCodeBlock"]);

interface PendingEdit {
  /** Document position where the match starts. */
  from: number;
  /** Document position where the match ends. */
  to: number;
  /** Trimmed inner title. */
  title: string;
}

/**
 * `editor` の本文を走査し、未 mark の `[[Title]]` テキストに `wikiLink` mark を
 * 適用する。返り値は実際に mark を適用したかどうか。`exists` / `referenced` /
 * `targetId` は未解決状態で書き込み、後続の `useWikiLinkStatusSync` が
 * `exists/referenced/targetId` を更新する責務を持つ。
 *
 * Scan `editor` for unmarked `[[Title]]` literals and apply the `wikiLink`
 * mark. Returns `true` when at least one mark was added. Status attributes
 * (`exists` / `referenced` / `targetId`) are written as unresolved so the
 * downstream `useWikiLinkStatusSync` hook can fill them in.
 *
 * @param editor - Tiptap editor instance whose Y.Doc just finished syncing.
 * @returns Whether any marks were applied.
 */
export function applyWikiLinkMarksToEditor(editor: Editor): boolean {
  const wikiLinkType = editor.schema.marks.wikiLink;
  if (!wikiLinkType) return false;

  const edits: PendingEdit[] = [];
  const { doc } = editor.state;

  doc.descendants((node, pos, parent) => {
    if (!node.isText) return;
    // 既に wikiLink mark 済みのテキストはスキップ（二重 mark 化防止）。
    // Skip text that already carries a wikiLink mark (no double-marking).
    if (node.marks.some((mark) => mark.type.name === "wikiLink")) return;
    // inline code mark 内はリテラルとして残す。
    // Inline code marks: keep the text literal.
    if (node.marks.some((mark) => mark.type.name === "code")) return;
    // code block / executable code block の中はリテラルとして残す。
    // Code block / executable code block children stay literal.
    if (parent && CODE_CONTAINER_TYPES.has(parent.type.name)) return;

    const text = node.text;
    if (!text || !text.includes("[[")) return;

    for (const match of text.matchAll(WIKI_LINK_TEXT_REGEX)) {
      const raw = match[1] ?? "";
      const title = raw.trim();
      // 空タイトル `[[   ]]` はスキップする（transformWikiLinksInContent と同契約）。
      // Empty titles `[[   ]]` are skipped (matches the paste-time contract).
      if (!title) continue;
      const start = pos + (match.index ?? 0);
      const end = start + match[0].length;
      edits.push({ from: start, to: end, title });
    }
  });

  if (edits.length === 0) return false;

  let tr = editor.state.tr;
  // `addMark` は文書位置を変えないため、順序に関わらず安全に複数適用できる。
  // `addMark` does not change positions, so the order is irrelevant; iterate
  // in document order for clarity.
  for (const edit of edits) {
    const mark = wikiLinkType.create({
      title: edit.title,
      exists: false,
      referenced: false,
      targetId: null,
    });
    tr = tr.addMark(edit.from, edit.to, mark);
  }

  // 履歴に残さないことで、ユーザーが「元に戻す」で同期前状態に戻れないようにする
  // のが望ましいが、Tiptap の history は ProseMirror transaction metadata で扱う。
  // ここでは標準 dispatch のままにし、必要なら呼び出し側で history を分離する。
  // We dispatch with default metadata; callers may wrap with `history` meta if
  // they want to keep the normalization out of the undo stack.
  editor.view.dispatch(tr);
  return true;
}
