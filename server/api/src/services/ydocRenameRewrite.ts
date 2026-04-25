/**
 * Y.Doc 上の WikiLink / タグマークのテキストおよび属性を書き換えるピュアな
 * ヘルパー。`titleRenamePropagationService.ts` から呼び出される。
 *
 * Pure helper that rewrites WikiLink and tag marks inside a Y.Doc when the
 * referenced page title changes. Called from `titleRenamePropagationService`.
 *
 * 設計方針 / Design notes (issue #726, updated for issue #737):
 * - 対象: `wikiLink` マーク（`attrs.title` / `attrs.targetId`）と `tag` マーク
 *   （`attrs.name` / `attrs.targetId`）。
 * - マッチング優先順位:
 *   1. マークが `targetId` 属性（UUID 文字列）を持つ場合は **id 一致のみ** で
 *      書き換える（`renamedPageId` と一致したときに書き換え）。これにより
 *      同名ページが共存していても誤書き換えを防ぐ（issue #737）。
 *   2. `targetId` を持たない（旧データ・未解決状態）場合はタイトル/名前
 *      文字列の一致でフォールバック書き換えを行う（既存挙動 / lazy migration）。
 * - セグメントのテキストは旧タイトル（正規化済み）と一致する場合にのみ書き換える。
 *   一致しない場合は「手動で編集された」扱いでテキストはそのまま、マーク属性だけ
 *   更新する。
 * - タグ書き換えは新タイトルがタグ名として有効な文字集合（`tagUtils.ts` の
 *   `TAG_PASTE_REGEX` に準拠）のときだけ行う。スペースや無効文字を含む
 *   タイトルへ追従するとタグが壊れるため。
 *
 * - Targets `wikiLink` marks (`attrs.title` / `attrs.targetId`) and `tag`
 *   marks (`attrs.name` / `attrs.targetId`).
 * - Match precedence:
 *   1. When the mark carries a `targetId` (UUID string), only rewrite when
 *      `targetId === renamedPageId`. This avoids same-title pages being
 *      rewritten in lockstep (issue #737).
 *   2. Otherwise (no `targetId` — pre-issue-#737 data or unresolved marks),
 *      fall back to title/name string matching (legacy behaviour, lazy
 *      migration so older docs still rewrite).
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
 * タグ名として許容する文字集合（正規表現の文字クラス内側のみ）。クライアント
 * 側の `@zedi/shared/tagCharacterClass` (`TAG_NAME_CHAR_CLASS`) と同一文字列で
 * なければならない。`server/api` はワークスペース外で独自の `bun.lock` を持つ
 * (Railway 単一 build context) ため `@zedi/shared` を直接 import できない。
 * 代わりに `src/lib/tagCharacterClassSync.test.ts` がクライアント側の vitest
 * で本ファイルを `fs.readFileSync` し、文字列一致を CI で検証する。本定数を
 * 編集する場合は `packages/shared/src/tagCharacterClass.ts` も同時に更新する
 * こと。
 *
 * Allowed characters for a tag name (inner contents of a regex character
 * class). MUST stay byte-equal to `TAG_NAME_CHAR_CLASS` in
 * `@zedi/shared/tagCharacterClass`. `server/api` is intentionally outside the
 * Bun workspace (its own `bun.lock` is the Railway build context), so it
 * cannot import `@zedi/shared` directly. The client-side vitest file
 * `src/lib/tagCharacterClassSync.test.ts` reads this file via
 * `fs.readFileSync` and asserts both literals match in CI. When editing this
 * constant, update `packages/shared/src/tagCharacterClass.ts` in lockstep.
 */
export const TAG_NAME_CHAR_CLASS_STRING = "A-Za-z0-9_\\-぀-ヿ㐀-鿿";

const VALID_TAG_NAME_REGEX = new RegExp(`^[${TAG_NAME_CHAR_CLASS_STRING}]+$`);

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

/**
 * `targetId` 属性が UUID 文字列として有効か判定するヘルパー。空文字や非文字列、
 * 純粋な空白は「id 無し」として扱い、タイトル一致 fallback の対象にする。
 *
 * Decide whether `targetId` is a usable UUID string. Empty / non-string /
 * whitespace-only values fall back to the legacy title-matching path so
 * pre-issue-#737 marks still propagate.
 */
function isUsableTargetId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 旧データ／未解決マークかを判定する。`targetId` を持たない場合のみ
 * タイトル一致 fallback を許可する（issue #737 lazy migration）。
 *
 * Detect a legacy / unresolved mark. Only marks without a usable `targetId`
 * are allowed to match by title (issue #737 lazy migration).
 */
function shouldUseTitleFallback(mark: Record<string, unknown>): boolean {
  return !isUsableTargetId(mark.targetId);
}

function planSegment(
  attributes: Record<string, unknown>,
  normalizedOld: string,
  allowTagRewrite: boolean,
  renamedPageId: string | null,
): SegmentPlan {
  const wikiLinkMark = isPlainObject(attributes.wikiLink) ? attributes.wikiLink : null;
  const tagMark = isPlainObject(attributes.tag) ? attributes.tag : null;
  const wikiTitle = wikiLinkMark ? extractStringAttr(wikiLinkMark.title) : null;
  const tagName = tagMark ? extractStringAttr(tagMark.name) : null;

  // `targetId` を持つマークは ID 一致のみで判定する。同名ページの誤書き換え
  // (issue #737) を防ぐため、`targetId` が renamedPageId と異なる場合は
  // 例えタイトルが一致していても書き換えない。`targetId` が無いマークだけが
  // タイトル一致 fallback の対象（lazy migration）。
  // Marks carrying a `targetId` are matched strictly by id. Even if the
  // title also matches, a non-matching id means the mark targets a different
  // (same-titled) page and must not be rewritten. Only id-less marks fall
  // back to title matching (legacy / lazy migration).
  const wikiHasFallback = wikiLinkMark !== null && shouldUseTitleFallback(wikiLinkMark);
  const tagHasFallback = tagMark !== null && shouldUseTitleFallback(tagMark);

  const wikiIdMatches =
    wikiLinkMark !== null &&
    renamedPageId !== null &&
    isUsableTargetId(wikiLinkMark.targetId) &&
    wikiLinkMark.targetId === renamedPageId;
  const tagIdMatches =
    tagMark !== null &&
    renamedPageId !== null &&
    isUsableTargetId(tagMark.targetId) &&
    tagMark.targetId === renamedPageId;

  const wikiTitleMatches = wikiTitle !== null && normalizeTitle(wikiTitle) === normalizedOld;
  const tagTitleMatches = tagName !== null && normalizeTitle(tagName) === normalizedOld;

  return {
    wikiLinkMark,
    tagMark,
    wikiMatches: wikiIdMatches || (wikiHasFallback && wikiTitleMatches),
    tagMatches: allowTagRewrite && (tagIdMatches || (tagHasFallback && tagTitleMatches)),
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
  renamedPageId: string | null,
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

    const plan = planSegment(attributes, normalizedOld, allowTagRewrite, renamedPageId);
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
  renamedPageId: string | null,
  result: RewriteResult,
): void {
  // `node.get(i)` は Yjs の連結リストを頭から辿るため O(i)。インデックス
  // ループにすると N 要素で O(N^2) になる。`toArray()` で一度だけ O(N)
  // 走査して配列化し、その後は通常のイテレーションに切り替える。
  // `node.get(i)` walks Yjs' linked list from the head (O(i)), so an
  // index-based loop is O(N^2) in the number of children. `toArray()` does
  // a single O(N) pass; iterate the resulting array instead.
  const children = node.toArray() as XmlNode[];
  for (const child of children) {
    if (child instanceof Y.XmlText) {
      rewriteText(child, oldTitle, newTitle, allowTagRewrite, renamedPageId, result);
    } else if (child instanceof Y.XmlElement) {
      walk(child, oldTitle, newTitle, allowTagRewrite, renamedPageId, result);
    }
    // Y.XmlHook は Tiptap のスキーマで通常使わないためスキップする。
    // Y.XmlHook is not used by Tiptap's default schema, so skip it.
  }
}

/**
 * `rewriteTitleRefsInDoc` のオプション。`renamedPageId` を渡せるようにし、
 * `targetId` 属性ベースの厳密マッチを有効化する（issue #737）。
 *
 * Options for `rewriteTitleRefsInDoc`. `renamedPageId` enables strict
 * `targetId`-based matching introduced for issue #737.
 */
export interface RewriteTitleRefsOptions {
  /**
   * リネーム対象ページの UUID。マークが `targetId` 属性を持つ場合は ID 一致で
   * のみ書き換える（同名ページの誤書き換えを防ぐ）。`null` / 省略時は従来の
   * タイトル一致のみで判定する（既存挙動）。
   *
   * UUID of the renamed page. When provided, marks carrying a `targetId`
   * attribute are rewritten only on id match — preventing same-title pages
   * from being rewritten in lockstep. When `null`/omitted, falls back to the
   * legacy title-only behaviour for every mark.
   */
  renamedPageId?: string | null;
  /**
   * 対象 XmlFragment 名。Tiptap の既定値 `"default"`。テスト用途以外では
   * 通常変更しない。
   *
   * Target XmlFragment name; Tiptap default `"default"`. Tests rarely need
   * to override this.
   */
  fragmentName?: string;
}

/**
 * `doc` 内の WikiLink / タグマークについて、旧タイトル `oldTitle` を参照
 * しているものを新タイトル `newTitle` へ書き換える。テキストノードは
 * セグメントのテキストが旧タイトルと一致する場合のみ書き換える。
 *
 * `options.renamedPageId` を指定すると、`targetId` 属性を持つマークは ID
 * 一致でのみ書き換える（同名ページの誤書き換えを防ぐ・issue #737）。
 * `targetId` を持たない既存マークは従来通りタイトル一致でフォールバックする
 * （lazy migration）。
 *
 * Rewrite WikiLink and tag marks in `doc` whose target matches `oldTitle`
 * so they point at `newTitle`. Segment text is only rewritten when it
 * matches the old title (so user-edited link text is preserved).
 *
 * Passing `options.renamedPageId` switches marks that carry a `targetId`
 * attribute to id-strict matching (preventing same-title-page collisions —
 * issue #737). Marks without a `targetId` continue to match by title
 * (legacy / lazy migration).
 *
 * @param doc - 書き換え対象の Y.Doc / the Y.Doc to mutate.
 * @param oldTitle - 旧ページタイトル / previous page title.
 * @param newTitle - 新ページタイトル / new page title.
 * @param options - 任意オプション / optional settings, see {@link RewriteTitleRefsOptions}.
 * @returns 書き換え件数 / counts of what was rewritten.
 */
export function rewriteTitleRefsInDoc(
  doc: Y.Doc,
  oldTitle: string,
  newTitle: string,
  options: RewriteTitleRefsOptions = {},
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
  const fragmentName = options.fragmentName ?? "default";
  const renamedPageId = isUsableTargetId(options.renamedPageId) ? options.renamedPageId : null;
  const fragment = doc.getXmlFragment(fragmentName);

  doc.transact(() => {
    walk(fragment, oldTitle, newTitle, allowTagRewrite, renamedPageId, result);
  }, "rename-propagation");

  return result;
}
