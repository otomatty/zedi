import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

/**
 *
 */
export interface TagSuggestionState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  decorations: DecorationSet;
}

export /**
 *
 */
const tagSuggestionPluginKey = new PluginKey<TagSuggestionState>("tagSuggestion");

/**
 *
 */
export interface TagSuggestionOptions {
  onStateChange?: (state: TagSuggestionState) => void;
}

/**
 * Live-detection plugin for hashtag typing (`#name`). Mirrors
 * `./wikiLinkSuggestionPlugin.ts` but triggers on `#` + allowed tag
 * characters rather than `[[`. See issue #725 (Phase 1).
 *
 * `#name` のライブ検出プラグイン。`[[` の代わりに `#` と許可文字で発火する
 * 点以外は `./wikiLinkSuggestionPlugin.ts` と同じ構造。Issue #725。
 *
 * Trigger rules / 発火条件:
 * - `#` must be at the start of input or preceded by whitespace/punctuation
 *   (never by a word char, `/`, or another `#`).
 * - The run after `#` must consist of Latin letters/digits, underscore,
 *   hyphen, or Hiragana/Katakana/CJK Unified/Extension A characters.
 * - Does not trigger inside inline code (the mark excludes `code`).
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

            if (meta?.close) {
              const nextState = {
                active: false,
                query: "",
                range: null,
                decorations: DecorationSet.empty,
              };
              onStateChange?.(nextState);
              return nextState;
            }

            const { selection } = newState;
            const { $from } = selection;

            // インラインコード内ではタグ検出を無効化する（コード内の `#` は
            // コメントやシェバンなど別用途の可能性が高いため）。
            // Disable detection inside inline code marks.
            if (newState.schema.marks.code) {
              const codeMark = newState.schema.marks.code;
              const marks = $from.marks();
              if (marks.some((m) => m.type === codeMark)) {
                if (prev.active) {
                  const nextState = {
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
            }

            // Get text before cursor (within the current block).
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "￼");

            // Find `#name` pattern where `#` is at start-of-block or preceded
            // by whitespace/punctuation but not by a word char, `/`, or `#`.
            // `#` の直前が語境界（先頭・空白・句読点）であり、`#` 自身が
            // 連続していない場合のみトリガーする。
            const match = textBefore.match(/(?:^|[^\w/#])#([A-Za-z0-9_\-぀-ヿ㐀-鿿]*)$/);

            if (match && match[1] !== undefined) {
              const query = match[1];
              // `match[0]` は先頭の非単語文字を含むことがあるので、`#` と
              // クエリ長で正確な範囲を逆算する。
              // Derive the exact range from `#` + query length rather than
              // `match[0]` which may include a leading boundary char.
              const tagLiteralLength = query.length + 1; // `#` + name
              const from = $from.pos - tagLiteralLength;
              const to = $from.pos;

              const decorations = DecorationSet.create(newState.doc, [
                Decoration.inline(from, to, {
                  class: "tag-typing",
                }),
              ]);

              const nextState = {
                active: true,
                query,
                range: { from, to },
                decorations,
              };

              onStateChange?.(nextState);
              return nextState;
            }

            if (prev.active) {
              const nextState = {
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
