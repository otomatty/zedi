import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { TAG_NAME_CHAR_CLASS } from "@zedi/shared/tagCharacterClass";
import { isExcludedTagName } from "./TagExtension";

/**
 * UI state for the `#name` tag suggestion picker.
 *
 * `#name` タグサジェスト UI の状態。
 *
 * - `active`: ポップアップを表示中か / popup is visible
 * - `query`: `#` 直後のクエリ文字列（先頭 `#` は含めない）/ raw query after `#`
 * - `range`: `#name` 全体のドキュメント内範囲（確定時に置換に使う）/
 *            document range covering `#name` (used to replace on confirm)
 * - `decorations`: `.tag-typing` クラスを乗せる inline decoration セット /
 *                  inline decoration set that paints the `.tag-typing` style
 */
export interface TagSuggestionState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  decorations: DecorationSet;
}

/**
 * ProseMirror plugin key for {@link TagSuggestionPlugin}.
 * `TagSuggestionPlugin` 用の ProseMirror プラグインキー。
 */
export const tagSuggestionPluginKey = new PluginKey<TagSuggestionState>("tagSuggestion");

/**
 * Options for {@link TagSuggestionPlugin}.
 * `TagSuggestionPlugin` のオプション。
 */
export interface TagSuggestionOptions {
  /**
   * Called whenever the plugin state changes (open / close / query update).
   * The host React component drives the popover from this callback, mirroring
   * how `WikiLinkSuggestionPlugin.onStateChange` feeds the WikiLink popup.
   *
   * 状態変化（オープン・クローズ・クエリ更新）のたびに呼ばれる。React 側で
   * このコールバックを使ってポップオーバー UI を駆動する（WikiLink 同等）。
   */
  onStateChange?: (state: TagSuggestionState) => void;
}

/**
 * Regex that detects a live `#name` query immediately before the cursor.
 *
 * - `(?:^|[^\w/#])` — same boundary contract as `TAG_PASTE_REGEX` and
 *   `TAG_INPUT_REGEX` so `abc#tec`, `/page#anchor`, `##` never trigger.
 * - `#([${TAG_NAME_CHAR_CLASS}]*)` — captures the (possibly empty) name body
 *   so the popover can show suggestions the moment `#` is typed.
 * - `$` — anchored to the end of the inspected text-before-cursor slice; the
 *   plugin re-evaluates on every transaction so this fires only when the
 *   caret is sitting right after `#name`.
 *
 * 入力規則 / 貼り付け規則と同じ境界条件で `#name` を検出するための正規表現。
 * 「カーソル直前のテキスト」の末尾 (`$`) に `#name` がある瞬間だけマッチする。
 * 空クエリ (`#` のみ) も拾うため、`#` を打鍵した瞬間からポップアップを出せる。
 */
const TAG_QUERY_REGEX = new RegExp(`(?:^|[^\\w/#])#([${TAG_NAME_CHAR_CLASS}]*)$`);

/**
 * Walk the resolved position to detect whether the caret sits inside an inline
 * `code` mark. Tag marks are configured with `excludes: "code"`, so opening
 * the popover here would offer an action the editor cannot perform.
 *
 * カーソル位置がインライン `code` マーク内にあるかを判定する。Tag マークは
 * `excludes: "code"` のためコード内では確定不可。サジェストも出さない。
 */
function isInsideInlineCode(
  $from: import("@tiptap/pm/model").ResolvedPos,
  schemaMarks: Record<string, import("@tiptap/pm/model").MarkType>,
): boolean {
  const codeMark = schemaMarks.code;
  if (!codeMark) return false;
  // `marks()` returns the marks active at the cursor. `isInSet` handles the
  // empty-cursor case (no stored marks) by returning the literal mark or
  // null; both mean "no code mark".
  // `marks()` はカーソル位置に作用するマーク列を返す。`isInSet` は空カーソル
  // 時にも安全に動き、null/値を返す。
  return Boolean(codeMark.isInSet($from.marks()));
}

/**
 * ProseMirror plugin that surfaces a `#name` autocomplete popover comparable
 * to `WikiLinkSuggestionPlugin` for `[[...]]`. The host renders the actual
 * UI and reacts to `onStateChange`; the plugin only owns query detection,
 * the typing decoration (`.tag-typing`), and the close meta.
 *
 * `#name` 用の ProseMirror プラグイン。`WikiLinkSuggestionPlugin` と
 * 同じ役割分担で、UI 描画は React 側に任せ、本プラグインはクエリ検出と
 * `.tag-typing` 装飾、`close` メタの処理だけを担う。
 *
 * 入力規則 (`TagExtension.addInputRules`) との二重マーク化を避けるため、
 * `TagExtension` 側のハンドラが `tagSuggestionPluginKey.getState(state).active`
 * を見て発火を抑止する契約。Esc → 空白終端の順で打鍵された場合は本プラグインが
 * 既に閉じているので入力規則経路でマーク化される（フォールバック）。
 *
 * Coordinated with `TagExtension.addInputRules`: while this plugin is active
 * the input rule short-circuits to avoid double-marking on confirm. After Esc
 * the suggestion state is `inactive`, so a typed terminator falls through to
 * the input rule path (the documented fallback).
 *
 * See issue #767 (Phase 2) and parent #725 (Phase 1).
 */
export const TagSuggestionPlugin = Extension.create<TagSuggestionOptions>({
  name: "tagSuggestion",

  addOptions() {
    return {
      onStateChange: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { onStateChange } = this.options;

    return [
      new Plugin<TagSuggestionState>({
        key: tagSuggestionPluginKey,

        state: {
          init() {
            return {
              active: false,
              query: "",
              range: null,
              decorations: DecorationSet.empty,
            };
          },

          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(tagSuggestionPluginKey);

            // Handle explicit close (Esc, suggestion confirm, etc.)
            // 明示的なクローズ（Esc、確定後のリセットなど）。
            if (meta?.close) {
              const nextState: TagSuggestionState = {
                active: false,
                query: "",
                range: null,
                decorations: DecorationSet.empty,
              };
              onStateChange?.(nextState);
              return nextState;
            }

            const { selection, schema } = newState;
            const { $from } = selection;

            // Range selections do not represent a typing caret, so collapse to
            // inactive (matches WikiLink/Slash plugin behaviour). 範囲選択中は
            // タイピングではないので非アクティブに倒す（WikiLink / Slash と同じ）。
            if (!selection.empty) {
              if (prev.active) {
                const nextState: TagSuggestionState = {
                  active: false,
                  query: "",
                  range: null,
                  decorations: DecorationSet.empty,
                };
                onStateChange?.(nextState);
                return nextState;
              }
              return prev;
            }

            // Code-block / inline-code suppression. タグマーク自体が
            // `excludes: "code"` のためコード周辺ではサジェストを出さない。
            // Inside code blocks / inline code the Tag mark cannot be applied
            // (`excludes: "code"`), so the popover is hidden too.
            if ($from.parent.type.spec.code || isInsideInlineCode($from, schema.marks)) {
              if (prev.active) {
                const nextState: TagSuggestionState = {
                  active: false,
                  query: "",
                  range: null,
                  decorations: DecorationSet.empty,
                };
                onStateChange?.(nextState);
                return nextState;
              }
              return prev;
            }

            // ￼ = ProseMirror's object replacement char for non-text nodes.
            // `￼` は ProseMirror が非テキストノードを 1 文字で置く位置合わせ用。
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "￼");
            const match = textBefore.match(TAG_QUERY_REGEX);

            if (match) {
              const query = match[1];

              // Mirror the input/paste rule's `isExcludedTagName` so we don't
              // surface the popover for values the rule would silently reject
              // (numeric-only, 6/8-char hex). Empty query is allowed — typing
              // `#` alone still opens the menu.
              // 入力規則 / 貼り付け規則の `isExcludedTagName` と同じ除外を適用し、
              // 規則側がリジェクトする値（数字のみ・6/8 桁 hex）でポップアップを
              // 出さない。空クエリ（`#` のみ）は許容してメニュー表示を開始する。
              if (query.length > 0 && isExcludedTagName(query)) {
                if (prev.active) {
                  const nextState: TagSuggestionState = {
                    active: false,
                    query: "",
                    range: null,
                    decorations: DecorationSet.empty,
                  };
                  onStateChange?.(nextState);
                  return nextState;
                }
                return prev;
              }

              // `#name` のドキュメント内範囲。境界文字（先頭 1 文字）はキャプチャに
              // 含まれないので、`from` は単純に「#」位置 = `$from.pos - 1 - query.length`。
              // The boundary char (if any) is non-capturing, so `from` is the
              // position of `#`, computed without inspecting `match[0].length`.
              const from = $from.pos - 1 - query.length;
              const to = $from.pos;

              const decorations = DecorationSet.create(newState.doc, [
                Decoration.inline(from, to, {
                  class: "tag-typing",
                }),
              ]);

              const nextState: TagSuggestionState = {
                active: true,
                query,
                range: { from, to },
                decorations,
              };

              onStateChange?.(nextState);
              return nextState;
            }

            // No match — collapse to inactive if previously open.
            // マッチしないので前回開いていたら閉じる。
            if (prev.active) {
              const nextState: TagSuggestionState = {
                active: false,
                query: "",
                range: null,
                decorations: DecorationSet.empty,
              };
              onStateChange?.(nextState);
              return nextState;
            }

            return prev;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          },

          handleKeyDown(view: EditorView, event: KeyboardEvent) {
            const pluginState = tagSuggestionPluginKey.getState(view.state);

            if (!pluginState?.active) {
              return false;
            }

            // Close on Escape — the React popover handles arrow keys / Enter /
            // Tab via its imperative ref, so we only own the lifecycle event
            // that hides the menu without inserting anything.
            // Esc は閉じるだけ。矢印 / Enter / Tab は React 側のハンドルで処理する。
            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(tagSuggestionPluginKey, { close: true }));
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
