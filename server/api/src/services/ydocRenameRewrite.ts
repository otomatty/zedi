/**
 * Y.Doc 上の WikiLink / タグマークのテキストおよび属性を書き換えるピュアな
 * ヘルパー。`titleRenamePropagationService.ts` から呼び出される。
 *
 * Pure helper that rewrites WikiLink and tag marks inside a Y.Doc when the
 * referenced page title changes. Called from `titleRenamePropagationService`.
 *
 * 設計方針 / Design notes (issue #726):
 * - 対象: `wikiLink` マーク（`attrs.title`）と `tag` マーク（`attrs.name`）。
 * - マッチは小文字・前後スペース除去で大文字小文字・空白差異を吸収する。
 * - セグメントのテキストが旧タイトル（正規化済み）と一致する場合にのみ
 *   テキストを書き換える。一致しない場合は「手動で編集された」扱いで
 *   テキストはそのままにし、マーク属性だけ更新する。
 * - タグ書き換えは新タイトルがタグ名として有効な文字集合（`tagUtils.ts` の
 *   `TAG_PASTE_REGEX` に準拠）のときだけ行う。スペースや無効文字を含む
 *   タイトルへ追従するとタグが壊れるため。
 *
 * - Targets `wikiLink` marks (keyed on `attrs.title`) and `tag` marks
 *   (keyed on `attrs.name`).
 * - Matching is case/whitespace insensitive to line up with `wikiLinkUtils`
 *   / `tagUtils` client-side normalization.
 * - Segment text is replaced only when it matches the old title after
 *   normalization. Non-matching segments are treated as manual edits — only
 *   the mark attribute is updated; the text is left alone.
 * - Tag rewrites happen only when the new title consists of valid tag
 *   characters (mirroring `TAG_PASTE_REGEX` in `src/lib/tagUtils.ts`).
 *   Otherwise the tag would become syntactically invalid after rename.
 */

import * as Y from "yjs";

/**
 * 書き換え結果のカウンタ。運用ログ・テスト検証に使う。
 * Counters reporting what the rewrite touched. Used for logs and tests.
 */
export interface RewriteResult {
  /** Number of `wikiLink` marks whose `title` attribute was rewritten. */
  wikiLinkMarksUpdated: number;
  /** Of the updated `wikiLink` marks, how many also had their text replaced. */
  wikiLinkTextUpdated: number;
  /** Number of `tag` marks whose `name` attribute was rewritten. */
  tagMarksUpdated: number;
  /** Of the updated `tag` marks, how many also had their text replaced. */
  tagTextUpdated: number;
}

/**
 * タグ名として許容する文字集合。`src/lib/tagUtils.ts` の `TAG_PASTE_REGEX`
 * と同じ字種（英数字・アンダースコア・ハイフン + ひらがな／カタカナ／CJK）
 * を想定している。`TAG_PASTE_REGEX` が変わったらここも更新する必要がある。
 *
 * Allowed characters for a tag name. Mirrors `TAG_PASTE_REGEX` in
 * `src/lib/tagUtils.ts` (alphanumerics, underscore, hyphen, plus hiragana /
 * katakana / CJK). Keep the two in sync if the client-side regex changes.
 */
const VALID_TAG_NAME_REGEX = /^[A-Za-z0-9_\-぀-ヿ㐀-鿿]+$/;

function normalizeTitle(value: string): string {
  return value.toLowerCase().trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface DeltaSegment {
  insert: string;
  attributes?: Record<string, unknown>;
}

interface PendingEdit {
  /** Start position within the Y.XmlText. / Y.XmlText 内の開始位置。 */
  index: number;
  /** Length of the segment being replaced. / 置換対象セグメントの長さ。 */
  length: number;
  /** Text to insert. When unchanged we reinsert the original text. / 挿入するテキスト。未変更なら元のテキストを再挿入する。 */
  text: string;
  /** Attribute set applied to the re-inserted text. / 再挿入テキストに適用する属性セット。 */
  attributes: Record<string, unknown>;
}

function extractStringAttr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface SegmentPlan {
  wikiMatches: boolean;
  tagMatches: boolean;
  wikiLinkMark: Record<string, unknown> | null;
  tagMark: Record<string, unknown> | null;
}

function planSegment(
  attributes: Record<string, unknown>,
  normalizedOld: string,
  allowTagRewrite: boolean,
): SegmentPlan {
  const wikiLinkMark = isPlainObject(attributes.wikiLink) ? attributes.wikiLink : null;
  const tagMark = isPlainObject(attributes.tag) ? attributes.tag : null;
  const wikiTitle = wikiLinkMark ? extractStringAttr(wikiLinkMark.title) : null;
  const tagName = tagMark ? extractStringAttr(tagMark.name) : null;
  return {
    wikiLinkMark,
    tagMark,
    wikiMatches: wikiTitle !== null && normalizeTitle(wikiTitle) === normalizedOld,
    tagMatches: tagName !== null && allowTagRewrite && normalizeTitle(tagName) === normalizedOld,
  };
}

function applyPlanToAttributes(
  attributes: Record<string, unknown>,
  plan: SegmentPlan,
  newTitle: string,
  segmentMatchesOld: boolean,
  result: RewriteResult,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attributes };
  if (plan.wikiMatches && plan.wikiLinkMark) {
    next.wikiLink = { ...plan.wikiLinkMark, title: newTitle };
    result.wikiLinkMarksUpdated += 1;
    if (segmentMatchesOld) result.wikiLinkTextUpdated += 1;
  }
  if (plan.tagMatches && plan.tagMark) {
    next.tag = { ...plan.tagMark, name: newTitle };
    result.tagMarksUpdated += 1;
    if (segmentMatchesOld) result.tagTextUpdated += 1;
  }
  return next;
}

function rewriteText(
  text: Y.XmlText,
  oldTitle: string,
  newTitle: string,
  allowTagRewrite: boolean,
  result: RewriteResult,
): void {
  const delta = text.toDelta() as Array<unknown>;
  if (delta.length === 0) return;

  const normalizedOld = normalizeTitle(oldTitle);
  const edits: PendingEdit[] = [];

  let offset = 0;
  for (const raw of delta) {
    if (!isPlainObject(raw) || typeof raw.insert !== "string") {
      // Embeds (non-string inserts) still occupy one position in Y.XmlText.
      // 埋め込み（非文字列 insert）も Y.XmlText 上で 1 文字分の位置を占める。
      offset += 1;
      continue;
    }

    const segmentText = raw.insert;
    const length = segmentText.length;
    const attributes: DeltaSegment["attributes"] = isPlainObject(raw.attributes)
      ? raw.attributes
      : undefined;

    if (length === 0) continue;
    if (!attributes) {
      offset += length;
      continue;
    }

    const plan = planSegment(attributes, normalizedOld, allowTagRewrite);
    if (!plan.wikiMatches && !plan.tagMatches) {
      offset += length;
      continue;
    }

    const segmentMatchesOld = normalizeTitle(segmentText) === normalizedOld;
    const nextAttributes = applyPlanToAttributes(
      attributes,
      plan,
      newTitle,
      segmentMatchesOld,
      result,
    );

    edits.push({
      index: offset,
      length,
      text: segmentMatchesOld ? newTitle : segmentText,
      attributes: nextAttributes,
    });

    offset += length;
  }

  if (edits.length === 0) return;

  // 末尾から適用することで、先に処理したセグメントの長さ変化が後続の
  // オフセットに影響するのを避ける。
  // Apply from the end so earlier edits' length changes do not shift later
  // offsets.
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i];
    if (!edit) continue;
    text.delete(edit.index, edit.length);
    text.insert(edit.index, edit.text, edit.attributes);
  }
}

type XmlNode = Y.XmlFragment | Y.XmlElement | Y.XmlText | Y.XmlHook;

function walk(
  node: Y.XmlFragment | Y.XmlElement,
  oldTitle: string,
  newTitle: string,
  allowTagRewrite: boolean,
  result: RewriteResult,
): void {
  const total = node.length;
  for (let i = 0; i < total; i++) {
    const child = node.get(i) as XmlNode;
    if (child instanceof Y.XmlText) {
      rewriteText(child, oldTitle, newTitle, allowTagRewrite, result);
    } else if (child instanceof Y.XmlElement) {
      walk(child, oldTitle, newTitle, allowTagRewrite, result);
    }
    // Y.XmlHook は Tiptap のスキーマで通常使わないためスキップする。
    // Y.XmlHook is not used by Tiptap's default schema, so skip it.
  }
}

/**
 * `doc` 内の WikiLink / タグマークについて、旧タイトル `oldTitle` を参照
 * しているものを新タイトル `newTitle` へ書き換える。テキストノードは
 * セグメントのテキストが旧タイトルと一致する場合のみ書き換える。
 *
 * Rewrite WikiLink and tag marks in `doc` whose target matches `oldTitle`
 * so they point at `newTitle`. Segment text is only rewritten when it
 * matches the old title (so user-edited link text is preserved).
 *
 * @param doc - 書き換え対象の Y.Doc / the Y.Doc to mutate.
 * @param oldTitle - 旧ページタイトル / previous page title.
 * @param newTitle - 新ページタイトル / new page title.
 * @param fragmentName - 対象 XmlFragment 名（デフォルト `"default"`）/ fragment name (default `"default"`).
 * @returns 書き換え件数 / counts of what was rewritten.
 */
export function rewriteTitleRefsInDoc(
  doc: Y.Doc,
  oldTitle: string,
  newTitle: string,
  fragmentName = "default",
): RewriteResult {
  const result: RewriteResult = {
    wikiLinkMarksUpdated: 0,
    wikiLinkTextUpdated: 0,
    tagMarksUpdated: 0,
    tagTextUpdated: 0,
  };

  if (!oldTitle || !newTitle) return result;
  if (normalizeTitle(oldTitle) === normalizeTitle(newTitle)) return result;

  const allowTagRewrite = VALID_TAG_NAME_REGEX.test(newTitle);
  const fragment = doc.getXmlFragment(fragmentName);

  doc.transact(() => {
    walk(fragment, oldTitle, newTitle, allowTagRewrite, result);
  }, "rename-propagation");

  return result;
}
