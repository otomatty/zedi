import { InputRule, Mark, markPasteRule, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TAG_NAME_CHAR_CLASS } from "@zedi/shared/tagCharacterClass";
import { tagSuggestionPluginKey } from "./tagSuggestionPlugin";

/**
 * Regex matching hashtag patterns `#name` in pasted text.
 *
 * 貼り付けテキスト中のハッシュタグ `#name` にマッチする正規表現。
 *
 * Preconditions to match:
 * - `#` must not be preceded by a word character, `/`, or another `#`
 *   (excludes `abc#tag`, URL fragments like `/page#anchor`, and `##`).
 * - The name must consist of characters in {@link TAG_NAME_CHAR_CLASS}
 *   (Latin letters/digits, underscore, hyphen, Hiragana, Katakana, CJK
 *   Unified/Extension A). The character class lives in `@zedi/shared` so
 *   the server's `VALID_TAG_NAME_REGEX` cannot drift from it.
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
 * 文字クラス本体は `@zedi/shared` の `TAG_NAME_CHAR_CLASS` を共有することで、
 * サーバ側 (`VALID_TAG_NAME_REGEX`) との二重定義によるドリフトを防ぐ。
 *
 * Fine-grained exclusions (numeric-only, 6/8-char hex colors) are applied in
 * `getAttributes` via {@link isExcludedTagName} so reject reasons sit next to
 * the data shape rather than in regex alternations.
 *
 * 数字のみ・6/8 桁純 hex のような細かな除外は {@link isExcludedTagName} で
 * 行い、理由とデータ形状をまとめて管理する。
 */
export const TAG_PASTE_REGEX = new RegExp(`(?<![\\w/#])#[${TAG_NAME_CHAR_CLASS}]+`, "g");

/**
 * Regex matching a hashtag pattern `#name` followed by a terminator character
 * while the user is typing. Used by {@link Tag.addInputRules} to convert
 * `#name` into the styled mark in real time.
 *
 * 入力規則用のハッシュタグ `#name` 検出正規表現。ユーザーが「タグ名に使えない
 * 任意の文字」（半角空白 / 改行 / 句読点 / 括弧 / 引用符 など）まで打ち切った
 * 時点で `#name` をリアルタイムにタグマーク化するために
 * {@link Tag.addInputRules} から使用する。
 *
 * Preconditions to match:
 * - `#` must not be preceded by a word character, `/`, or another `#`
 *   (mirrors {@link TAG_PASTE_REGEX} so paste / typed paths agree).
 * - The name must consist of {@link TAG_NAME_CHAR_CLASS} characters.
 * - The match ends with **any character outside `TAG_NAME_CHAR_CLASS`** —
 *   whitespace, ASCII / CJK punctuation, parentheses, brackets, quotes, etc.
 *   This mirrors how mainstream products (Twitter / GitHub) close hashtags
 *   and keeps `(#tag)` / `"#tag"` / `[#tag]` working.
 *
 * The leading boundary and the terminator are intentionally **outside** any
 * capture group — the only capture (`match[1]`) is the literal `#name`. The
 * input-rule handler computes the document range from `match[1]` and applies
 * the mark to that range only, leaving the user-typed terminator in place
 * (unlike `markInputRule`, which would delete non-capture trailing text).
 *
 * 先頭境界・終端文字は **キャプチャに含めない**。唯一のキャプチャ `match[1]` は
 * `#name` 本体で、入力規則ハンドラはこの範囲だけにマークを付け、ユーザーが
 * 直前に打鍵した終端文字（空白・句読点・括弧・引用符など）はそのまま残す。
 * `markInputRule` を使うと終端文字が削除されて打ち直しが必要になるため、
 * 独自ハンドラで範囲のみマーク化する。
 */
export const TAG_INPUT_REGEX = new RegExp(
  `(?:^|[^\\w/#])(#[${TAG_NAME_CHAR_CLASS}]+)[^${TAG_NAME_CHAR_CLASS}]$`,
);

/**
 * Regex for extracting a tag name from a single `#name` literal (non-global).
 * 単一の `#name` 文字列からタグ名を取り出すための正規表現（非グローバル）。
 */
const TAG_NAME_REGEX = new RegExp(`^#([${TAG_NAME_CHAR_CLASS}]+)`);

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
      /**
       * 解決済みターゲットページの UUID。`useTagStatusSync` がリンク解決時に
       * 埋め、リネーム伝播（issue #737 / `ydocRenameRewrite`）がタグ名文字列
       * ではなく ID 一致で対象を特定できるようにする。未解決や旧データでは
       * `null` で、その場合の伝播は名前文字列でフォールバックする
       * （後方互換のため）。
       *
       * Resolved target page UUID. Populated by `useTagStatusSync` once the
       * tag resolves to an existing page so rename propagation
       * (issue #737 / `ydocRenameRewrite`) matches by id instead of by name
       * string. `null` for unresolved or pre-issue-#737 marks; the rewriter
       * falls back to name matching in that case (lazy migration).
       */
      targetId: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-target-id");
          if (typeof raw !== "string") return null;
          const normalized = raw.trim();
          return normalized.length > 0 ? normalized : null;
        },
        renderHTML: (attributes) => {
          const value = attributes.targetId;
          if (typeof value !== "string" || value.length === 0) {
            return {};
          }
          return { "data-target-id": value };
        },
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
          return { name, exists: false, referenced: false, targetId: null };
        },
      }),
    ];
  },

  addInputRules() {
    // `this.type` を外側で捕捉し、ハンドラは PURE な関数として閉じ込める。
    // Capture `this.type` outside the handler so the rule stays a pure closure.
    const markType = this.type;

    return [
      new InputRule({
        find: TAG_INPUT_REGEX,
        handler: ({ state, range, match }) => {
          const tagText = match[1];
          const fullMatch = match[0];
          if (!tagText || !fullMatch) return null;

          // タグサジェスト (`TagSuggestionPlugin`, issue #767 Phase 2) が
          // open の間は入力規則を発火させない。確定操作はサジェスト側が
          // `tag` Mark の挿入を担当するため、ここで二重にマーク化すると
          // `exists` / `targetId` 等の解決済み属性を上書きしてしまう。
          // Esc でサジェストを閉じた後の空白終端は inactive 状態になるので
          // 通常どおり入力規則経路でマーク化される（フォールバック契約）。
          //
          // While the tag suggestion popover is open (`TagSuggestionPlugin`,
          // issue #767 Phase 2) the input rule must defer: confirming via the
          // popover applies the mark with resolved `exists` / `targetId`,
          // and re-running the input rule here would clobber those attrs
          // with default values. After Esc the suggestion is inactive, so
          // typing a terminator falls through to the input-rule path — the
          // documented Esc-then-terminator fallback.
          const suggestionState = tagSuggestionPluginKey.getState(state);
          if (suggestionState?.active) return null;

          // Re-use the same exclusion contract as the paste rule so typed and
          // pasted input share their reject reasons (numeric-only / 6/8-hex).
          // 貼り付け規則と同じ除外ルールに合わせる（数字のみ・6/8 桁 hex）。
          const name = extractTagName(tagText);
          if (!name || isExcludedTagName(name)) return null;

          // Compute the document range of the `#name` portion: the regex may
          // include a non-capturing leading boundary (`[^\w/#]`) and a trailing
          // terminator (whitespace or punctuation), neither of which should be
          // marked. Code-mark neighbourhoods are filtered upstream by the
          // input-rule runner (it short-circuits on `mark.type.spec.code`), so
          // the `excludes: "code"` invariant requires no extra guard here.
          // `#name` 本体の文書内範囲を算出する。先頭境界（非単語文字）と
          // 末尾の終端文字はマーク範囲に含めない。コードマーク内では Tiptap の
          // 入力規則ランナー側で短絡されるためここで追加チェックは不要。
          const tagOffsetInMatch = fullMatch.indexOf(tagText);
          const tagStart = range.from + tagOffsetInMatch;
          const tagEnd = tagStart + tagText.length;

          // Tiptap の入力規則プラグインはハンドラ呼び出し時点でユーザーが
          // タイプした文字（終端文字）をまだドキュメントに挿入していない。
          // `tr.steps.length > 0` で `handleTextInput` が `true` を返す扱いと
          // なり、ProseMirror デフォルトのテキスト挿入はスキップされるため、
          // ここで終端文字を明示的に挿入してユーザー入力を保全する。終端文字は
          // `fullMatch` のうちキャプチャ後ろに残る部分（通常 1 文字）に等しい。
          // Tiptap's input-rule plugin invokes the handler before ProseMirror
          // commits the just-typed character. Returning a transaction with
          // `steps > 0` causes the plugin to dispatch it and skip the default
          // text insertion, so we re-insert the terminator (the slice of
          // `fullMatch` after the capture) ourselves to preserve the keystroke.
          const typedTerminator = fullMatch.slice(tagOffsetInMatch + tagText.length);

          // 注: `state.tr` は呼び出すたびに新しい Transaction を返すゲッター。
          // Tiptap が `state` をラップして `tr` が同一インスタンスを返すように
          // しているため、destructure して取り出した `tr` への変更が一括で
          // ディスパッチされる。
          // `state.tr` is a getter; Tiptap proxies `state` so accesses share a
          // single `tr` instance which is then dispatched after the handler.
          const { tr } = state;
          if (typedTerminator.length > 0) {
            // 終端文字をマーク範囲の直後に挿入する（範囲シフトを起こさないよう
            // mark 適用より前に行う）。
            // Insert the terminator first so the subsequent `addMark` range
            // does not need rebasing.
            tr.insertText(typedTerminator, range.to);
          }
          tr.addMark(
            tagStart,
            tagEnd,
            markType.create({ name, exists: false, referenced: false, targetId: null }),
          );
          tr.removeStoredMark(markType);
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
