import { Extension } from "@tiptap/core";
import type { MarkType, ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * UI state for the `/` slash menu (query, range, decorations).
 * `/` スラッシュメニュー用 UI 状態（クエリ、範囲、装飾）。
 */
export interface SlashSuggestionState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  decorations: DecorationSet;
}

/**
 * ProseMirror plugin key for slash suggestions.
 * スラッシュサジェスト用 ProseMirror プラグインキー。
 */
export const slashSuggestionPluginKey = new PluginKey<SlashSuggestionState>("slashSuggestion");

/**
 * Options for {@link SlashSuggestionPlugin}.
 * {@link SlashSuggestionPlugin} のオプション。
 */
export interface SlashSuggestionOptions {
  /** Called when slash menu state changes. / スラッシュメニュー状態が変わったときに呼ぶ */
  onStateChange?: (state: SlashSuggestionState) => void;
}

/**
 * Returns true when the caret sits inside an inline `code` mark (Markdown `` ` ``).
 * Mirrors {@link TagSuggestionPlugin}'s helper so slash behaviour stays aligned.
 *
 * インライン `code` マーク（Markdown のバッククォート）内かどうか。
 * `TagSuggestionPlugin` と同じ判定でスラッシュとタグの契約を揃える。
 */
function isInsideInlineCode($from: ResolvedPos, schemaMarks: Record<string, MarkType>): boolean {
  const codeMark = schemaMarks.code;
  if (!codeMark) return false;
  return Boolean(codeMark.isInSet($from.marks()));
}

/**
 * Slash suggestion plugin for "/ command" menu.
 * Triggers on:
 *   1. "/" at the start of a line
 *   2. " /" (space followed by slash) in the middle of text
 *
 * The text after "/" is treated as a filter query.
 *
 * Does **not** activate inside an inline `code` mark or a `code_block` node, so
 * literals such as `` `/analyze` `` stay plain text (same rationale as tag suggestions).
 *
 * インライン `code` マーク・`code_block` ノード内では起動しない。
 * `` `/analyze` `` のようにスラッシュをテキストとして書くためのエスケープ口。
 */
export const SlashSuggestionPlugin = Extension.create<SlashSuggestionOptions>({
  name: "slashSuggestion",

  addOptions() {
    return {
      onStateChange: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { onStateChange } = this.options;

    return [
      new Plugin<SlashSuggestionState>({
        key: slashSuggestionPluginKey,

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
            const meta = tr.getMeta(slashSuggestionPluginKey);

            // Handle explicit close
            if (meta?.close) {
              const nextState: SlashSuggestionState = {
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

            // Only activate on cursor (not range) selections
            if (!selection.empty) {
              if (prev.active) {
                const nextState: SlashSuggestionState = {
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

            // Suppress inside code blocks / inline code so `/token` stays literal text.
            // `textBetween` strips marks; without this check `/run` inside `` `…` `` would still match (^|\s)/.
            // コードブロック・インラインコード内では抑止。マーク無視でマッチしてしまうのを防ぐ。
            if ($from.parent.type.spec.code || isInsideInlineCode($from, schema.marks)) {
              if (prev.active) {
                const nextState: SlashSuggestionState = {
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

            // Get text before cursor within the current text block
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "\ufffc");

            // Match "/" at the start of line, or " /" preceded by a space.
            // Capture the query after "/"
            // Allow spaces after the first token so `/analyze path/to/file` stays active.
            // 1 語目以降にスペースを許可し、`/analyze path` 入力中もメニューを維持する。
            const match = textBefore.match(/(^|\s)\/([^\n]*)$/);

            if (match) {
              const query = match[2]; // text after "/"
              const from = $from.pos - match[0].length + match[1].length; // start at "/"
              const to = $from.pos;

              const decorations = DecorationSet.create(newState.doc, [
                Decoration.inline(from, to, {
                  class: "slash-command-typing",
                }),
              ]);

              const nextState: SlashSuggestionState = {
                active: true,
                query,
                range: { from, to },
                decorations,
              };

              onStateChange?.(nextState);
              return nextState;
            }

            // No match, deactivate
            if (prev.active) {
              const nextState: SlashSuggestionState = {
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
        },
      }),
    ];
  },
});
