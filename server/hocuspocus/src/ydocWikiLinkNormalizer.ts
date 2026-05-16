/**
 * Y.Doc 上の未 mark な `[[Title]]` プレーンテキストを `wikiLink` mark へ昇格させる
 * 純粋なヘルパー。`server/api/src/services/ydocWikiLinkNormalizer.ts` と意図的に
 * 同等のロジックを複製している（CLAUDE.md / AGENTS.md にあるとおり Hocuspocus
 * パッケージは独立した Bun build context のため共有 import 不可）。
 *
 * Pure helper that promotes unmarked `[[Title]]` plain text inside a Y.Doc to
 * `wikiLink` marks. Intentionally mirrors
 * `server/api/src/services/ydocWikiLinkNormalizer.ts`; the Hocuspocus server
 * runs in its own Bun build context (Railway) and cannot import from
 * `server/api`. The drift detector at
 * `src/lib/ydocWikiLinkNormalizerSync.test.ts` fails CI if the body diverges.
 *
 * ⚠️ 変更時は `server/api/src/services/ydocWikiLinkNormalizer.ts` も合わせて
 *    更新すること（先頭 docblock 以外はバイト等価で同期される前提）。
 *    Keep this byte-equivalent (below the leading docblock) with the
 *    api-side copy whenever it changes.
 *
 * 詳細な設計方針 / スキップ条件 / 冪等性については API 側の同名ファイルを参照。
 * See the api-side copy for design notes, skip rules, and idempotency.
 */

import * as Y from "yjs";

/**
 * `[[Title]]` パターン（global, lastIndex 副作用は `matchAll` でのみ使うため
 * 漏れない）。クライアント側の paste rule `WikiLinkExtension.WIKI_LINK_PASTE_REGEX`
 * と意味的に一致させる（パスタ時 / 保存時の両方で同じ文字列集合をリンクと判定する）。
 *
 * Matches `[[Title]]` literals. Kept semantically aligned with the
 * client-side paste rule `WikiLinkExtension.WIKI_LINK_PASTE_REGEX` so that
 * inputs marked at paste time and inputs lazily migrated server-side cover
 * the exact same set of strings.
 */
const WIKI_LINK_TEXT_REGEX = /\[\[([^[\]]+)\]\]/g;

/**
 * Tiptap がコードコンテナとして扱う Y.XmlElement 名の集合。
 * Tiptap node names treated as code containers — text inside is preserved
 * verbatim (no WikiLink promotion).
 */
const CODE_CONTAINER_TYPES = new Set<string>(["codeBlock", "code_block", "executableCodeBlock"]);

/**
 * 正規化結果のカウンタ。ログ・テスト・「変更ありか」判定で利用する。
 * Counters describing what the normalizer did. Used for logs, tests, and to
 * decide whether persistence is needed.
 */
export interface NormalizeWikiLinkResult {
  /** Number of `wikiLink` marks newly applied. / 新規に適用した `wikiLink` mark 数。 */
  marksApplied: number;
}

/**
 * `applyWikiLinkMarksToYDoc` のオプション。Tiptap の既定フラグメント `"default"`
 * を指定変更したいテスト用途のみ `fragmentName` を渡す。
 *
 * Options for `applyWikiLinkMarksToYDoc`. Override `fragmentName` only in
 * tests; production code uses Tiptap's default `"default"`.
 */
export interface ApplyWikiLinkMarksOptions {
  /** XmlFragment 名 / fragment name. */
  fragmentName?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface PendingFormat {
  /** Absolute index within the Y.XmlText. / Y.XmlText 内の絶対位置。 */
  index: number;
  /** Length of the `[[Title]]` literal. / `[[Title]]` の長さ。 */
  length: number;
  /** Trimmed inner title. / トリム済み内側タイトル。 */
  title: string;
}

/**
 * 単一 Y.XmlText 上を走査し、未 mark の `[[Title]]` セグメントだけに対して
 * `wikiLink` mark を適用する候補リストを集計したのち、まとめて `format` する。
 *
 * Walk a single Y.XmlText, collect format candidates for unmarked
 * `[[Title]]` runs, then apply them all in one pass. Position math uses the
 * segment offsets from `toDelta()`; embeds occupy one position each.
 */
function normalizeText(
  text: Y.XmlText,
  parentTypeName: string,
  result: NormalizeWikiLinkResult,
): void {
  // 親が code-block ノードなら、内側のテキストはリテラル扱いで全スキップ。
  // If the parent is a code-container node, leave all text alone.
  if (CODE_CONTAINER_TYPES.has(parentTypeName)) return;

  const delta = text.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>;
  if (delta.length === 0) return;

  const pending: PendingFormat[] = [];
  let offset = 0;

  for (const segment of delta) {
    if (typeof segment.insert !== "string") {
      // 埋め込み (画像等) は Y.XmlText 上で 1 文字分の位置を占める。
      // Embeds (e.g. images) occupy a single position inside Y.XmlText.
      offset += 1;
      continue;
    }

    const segmentText = segment.insert;
    const length = segmentText.length;
    if (length === 0) continue;

    const attrs = isPlainObject(segment.attributes) ? segment.attributes : undefined;

    // 既存 wikiLink mark を二重適用しない / 既存 code mark 内はリテラル維持。
    // Skip if already wiki-marked or sitting inside an inline-code mark.
    if (attrs && (isPlainObject(attrs.wikiLink) || attrs.code)) {
      offset += length;
      continue;
    }

    if (segmentText.includes("[[")) {
      for (const match of segmentText.matchAll(WIKI_LINK_TEXT_REGEX)) {
        const raw = match[1] ?? "";
        const title = raw.trim();
        if (!title) continue;
        pending.push({
          index: offset + (match.index ?? 0),
          length: match[0].length,
          title,
        });
      }
    }

    offset += length;
  }

  if (pending.length === 0) return;

  // `format` はテキスト長・位置を変更しないため適用順は不問。可読性のため
  // ドキュメント順に処理する。
  // `format` does not move text or change positions, so the order is
  // irrelevant; iterate in document order for clarity.
  for (const edit of pending) {
    text.format(edit.index, edit.length, {
      wikiLink: {
        title: edit.title,
        exists: false,
        referenced: false,
        targetId: null,
      },
    });
    result.marksApplied += 1;
  }
}

type XmlChild = Y.XmlFragment | Y.XmlElement | Y.XmlText | Y.XmlHook;

/**
 * XmlFragment / XmlElement を再帰的に走査し、各 Y.XmlText の親要素名を
 * `normalizeText` に渡して code-container 判定を行わせる。
 *
 * Recursively walk `node`; carry the parent's `nodeName` into `normalizeText`
 * so it can short-circuit code-container subtrees without re-traversing them.
 */
function walk(
  node: Y.XmlFragment | Y.XmlElement,
  parentTypeName: string,
  result: NormalizeWikiLinkResult,
): void {
  // `node.get(i)` は Yjs の連結リストを毎回頭から辿るため、インデックス
  // ループで N 要素を回ると O(N^2) になる。`toArray()` で 1 回 O(N) で
  // 配列化し、その後は通常イテレーションに切り替える。`ydocRenameRewrite.walk`
  // と同じ理由で同じパターンを採用する。
  // `node.get(i)` is O(i) on Yjs' linked list, making index-based loops
  // O(N^2). One `toArray()` pass is O(N); iterate the resulting array
  // instead. Mirrors `ydocRenameRewrite.walk` for the same reason.
  const children = node.toArray() as XmlChild[];
  for (const child of children) {
    if (child instanceof Y.XmlText) {
      normalizeText(child, parentTypeName, result);
    } else if (child instanceof Y.XmlElement) {
      walk(child, child.nodeName, result);
    }
    // Y.XmlHook は Tiptap の既定スキーマでは現れないためスキップ。
    // Y.XmlHook is not part of the default Tiptap schema; skip it.
  }
}

/**
 * `doc` の指定フラグメント以下に存在する未 mark の `[[Title]]` プレーンテキストを
 * `wikiLink` mark に昇格させる。冪等: 2 回目以降は `marksApplied === 0` を返す。
 *
 * Promote unmarked `[[Title]]` plain text inside `doc`'s named fragment to
 * `wikiLink` marks. Idempotent — subsequent invocations return
 * `marksApplied === 0` once everything is already marked.
 *
 * @param doc - 対象 Y.Doc / the Y.Doc to mutate.
 * @param options - 任意設定 / optional settings (chiefly `fragmentName`).
 * @returns 適用件数 / count of marks applied during this call.
 */
export function applyWikiLinkMarksToYDoc(
  doc: Y.Doc,
  options: ApplyWikiLinkMarksOptions = {},
): NormalizeWikiLinkResult {
  const result: NormalizeWikiLinkResult = { marksApplied: 0 };
  const fragmentName = options.fragmentName ?? "default";
  const fragment = doc.getXmlFragment(fragmentName);

  // 単一 `transact` でまとめることで、Hocuspocus の保存トリガやリンクグラフ
  // 再構築 observer が 1 回だけ呼ばれるようにする。origin にラベルを付けて
  // 由来を追跡可能にする。
  // Wrap in a single `transact` so observers fire once and the origin label
  // makes the source traceable in Hocuspocus / graph-sync logs.
  doc.transact(() => {
    walk(fragment, "", result);
  }, "wikilink-normalize");

  return result;
}
