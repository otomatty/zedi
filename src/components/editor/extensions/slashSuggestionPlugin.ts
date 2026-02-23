import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SlashSuggestionState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  decorations: DecorationSet;
}

export const slashSuggestionPluginKey = new PluginKey<SlashSuggestionState>("slashSuggestion");

export interface SlashSuggestionOptions {
  onStateChange?: (state: SlashSuggestionState) => void;
}

/**
 * Slash suggestion plugin for "/ command" menu.
 * Triggers on:
 *   1. "/" at the start of a line
 *   2. " /" (space followed by slash) in the middle of text
 *
 * The text after "/" is treated as a filter query.
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

            const { selection } = newState;
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

            // Get text before cursor within the current text block
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "\ufffc");

            // Match "/" at the start of line, or " /" preceded by a space.
            // Capture the query after "/"
            const match = textBefore.match(/(^|\s)\/([^\s/]*)$/);

            if (match) {
              const query = match[2]; // text after "/"
              const slashOffset = match[0].length - match[2].length; // length of prefix including "/"
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
