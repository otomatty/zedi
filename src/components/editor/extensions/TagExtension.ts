import { Mark, markPasteRule, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Regex matching hashtag patterns `#name` in pasted text.
 *
 * 貼り付けテキスト中のハッシュタグ `#name` にマッチする正規表現。
 *
 * Preconditions to match:
 * - `#` must not be preceded by a word character, `/`, or another `#`
 *   (excludes `abc#tag`, URL fragments like `/page#anchor`, and `##`).
 * - The name must consist of Latin letters/digits, underscore, hyphen,
 *   Hiragana, Katakana, or CJK Unified/Extension A characters.
 * - Trailing punctuation (`、。,.!?:;` 等) terminates the name.
 *
 * Tiptap's `markPasteRule` applies the mark to the *last* capture group and
 * deletes the rest of the match — the same caveat `WikiLinkExtension`
 * documents. To keep the leading `#` inside the mark we intentionally omit
 * capture groups so `match[match.length - 1]` equals `match[0]` (the full
 * `#name` literal). The tag name is extracted afterwards via
 * {@link extractTagName}.
 *
 * Tiptap の `markPasteRule` は最後のキャプチャグループにのみマークを適用し、
 * それ以外を削除する仕様（`WikiLinkExtension` と同様）。先頭の `#` を
 * マーク範囲に含めるため、敢えてキャプチャグループを使わず `match[0]` を
 * そのままマーク対象とし、タグ名は {@link extractTagName} で後付け抽出する。
 *
 * Fine-grained exclusions (numeric-only, 6/8-char hex colors) are applied in
 * `getAttributes` via {@link isExcludedTagName} so reject reasons sit next to
 * the data shape rather than in regex alternations.
 *
 * 数字のみ・6/8 桁純 hex のような細かな除外は {@link isExcludedTagName} で
 * 行い、理由とデータ形状をまとめて管理する。
 */
export const TAG_PASTE_REGEX = /(?<![\w/#])#[A-Za-z0-9_\-぀-ヿ㐀-鿿]+/g;

/**
 * Regex for extracting a tag name from a single `#name` literal (non-global).
 * 単一の `#name` 文字列からタグ名を取り出すための正規表現（非グローバル）。
 */
const TAG_NAME_REGEX = /^#([A-Za-z0-9_\-぀-ヿ㐀-鿿]+)/;

/**
 * Pattern matching a string of pure hexadecimal digits (any length).
 * 任意長の純 hex 文字列。長さ判定と組み合わせて色リテラルを除外する。
 */
const PURE_HEX_REGEX = /^[0-9A-Fa-f]+$/;

/**
 * Extract the trimmed name from a `#name` literal, or `null` if no valid name
 * follows the `#`.
 *
 * `#name` 形式の文字列からトリム済みのタグ名を取り出す。`#` の直後に
 * 有効な名前が続かなければ `null`。
 */
export function extractTagName(fullMatch: string): string | null {
  const m = fullMatch.match(TAG_NAME_REGEX);
  const name = (m?.[1] ?? "").trim();
  return name || null;
}

/**
 * Return true when a tag name should be rejected (treated as non-tag text).
 *
 * タグとして扱うべきでない名前のとき `true` を返す。除外対象:
 * - 空または空白のみ / empty or whitespace-only
 * - 数字のみ（`#1`, `#42`）／ purely numeric
 * - 6 桁または 8 桁の純 hex（CSS カラーコード）／ 6- or 8-char pure hex
 */
export function isExcludedTagName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/^\d+$/.test(trimmed)) return true;
  if ((trimmed.length === 6 || trimmed.length === 8) && PURE_HEX_REGEX.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Options for the Tag mark extension.
 * タグマーク拡張のオプション。
 */
export interface TagOptions {
  HTMLAttributes: Record<string, unknown>;
  /**
   * Invoked when the user clicks a rendered tag. The tag name (without `#`)
   * is passed so the caller can navigate to the corresponding page.
   *
   * 描画されたタグをクリックした際に呼ばれる。`#` を除いた名前が渡されるので、
   * 呼び出し側で対応するページ遷移を行う。
   */
  onTagClick?: (name: string) => void;
}

// Tag status types (mirror WikiLink for data-model parity):
// - exists=true: Links to an existing page named after the tag
// - exists=false, referenced=true: No page yet, but the same tag is used elsewhere
// - exists=false, referenced=false: Brand-new tag, ghost-only

/**
 * Tiptap mark extension for hashtags (`#name`). Shares the underlying data
 * model with `WikiLink`; `linkType` is set to `'tag'` when syncing to the
 * `links` / `ghost_links` tables. See issue #725.
 *
 * ハッシュタグ（`#name`）用の Tiptap マーク拡張。データモデルは WikiLink と
 * 共有し、`links` / `ghost_links` 同期時に `linkType = 'tag'` として扱う。
 * Issue #725 を参照。
 */
export const Tag = Mark.create<TagOptions>({
  name: "tag",

  priority: 1000,

  // 他のマーク（コード・インラインコード）と重複させない。コード内の `#` は
  // タグとして扱わないという除外要件を実装レベルでも担保する。
  // Exclude mixing with code marks so `#` inside inline code is never a tag.
  excludes: "code",

  addOptions() {
    return {
      HTMLAttributes: {},
      onTagClick: undefined,
    };
  },

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-name"),
        renderHTML: (attributes) => ({
          "data-name": attributes.name,
        }),
      },
      exists: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-exists") === "true",
        renderHTML: (attributes) => ({
          "data-exists": String(attributes.exists),
        }),
      },
      referenced: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-referenced") === "true",
        renderHTML: (attributes) => ({
          "data-referenced": String(attributes.referenced),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-tag]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const exists =
      HTMLAttributes["data-exists"] === "true" || HTMLAttributes["data-exists"] === true;
    const referenced =
      HTMLAttributes["data-referenced"] === "true" || HTMLAttributes["data-referenced"] === true;

    // Determine CSS class based on link status (mirrors WikiLink classes with
    // `tag-*` prefix so visual states stay consistent across both mark types).
    // WikiLink と視覚状態を揃えるため、`tag-*` プレフィックスで同じ 3 状態を
    // 区別する。
    let className = "tag";
    if (!exists) {
      className = referenced ? "tag-referenced" : "tag-ghost";
    }

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-tag": "",
        class: className,
      }),
      0,
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: TAG_PASTE_REGEX,
        type: this.type,
        getAttributes: (match) => {
          // `match[0]` は `#name` 全体。ここからタグ名のみを取り出し、除外
          // ルールに該当するものはマーク付与を中止する。キャプチャグループを
          // 使わないのは `markPasteRule` が最後のキャプチャだけをマーク範囲に
          // するため（先頭 `#` が外れないように全一致を対象にする）。
          // `match[0]` is the full `#name` literal. Extract the name (stripping
          // the leading `#`) and reject when it hits an exclusion rule.
          const name = extractTagName(match[0] ?? "");
          if (!name || isExcludedTagName(name)) return false;
          return { name, exists: false, referenced: false };
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { onTagClick } = this.options;

    return [
      new Plugin({
        key: new PluginKey("tagClick"),
        props: {
          handleClick: (_view, _pos, event) => {
            if (!onTagClick) return false;

            // `event.target` は `EventTarget | null` でありテキストノード等
            // `Element` 以外も取り得るため、`closest` 呼び出し前にガードする。
            // `event.target` may not be an `Element`; guard before `closest`.
            if (!(event.target instanceof Element)) return false;

            // Check if clicked on a tag element
            const tagElement = event.target.closest("[data-tag]") as HTMLElement | null;
            if (!tagElement) return false;

            const name = tagElement.getAttribute("data-name");

            if (name) {
              event.preventDefault();
              event.stopPropagation();
              onTagClick(name);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
