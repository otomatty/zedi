import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

export interface WikiLinkSuggestionState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  decorations: DecorationSet;
}

export const wikiLinkSuggestionPluginKey = new PluginKey<WikiLinkSuggestionState>('wikiLinkSuggestion');

export interface WikiLinkSuggestionOptions {
  onStateChange?: (state: WikiLinkSuggestionState) => void;
}

export const WikiLinkSuggestionPlugin = Extension.create<WikiLinkSuggestionOptions>({
  name: 'wikiLinkSuggestion',

  addOptions() {
    return {
      onStateChange: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { onStateChange } = this.options;

    return [
      new Plugin<WikiLinkSuggestionState>({
        key: wikiLinkSuggestionPluginKey,

        state: {
          init() {
            return {
              active: false,
              query: '',
              range: null,
              decorations: DecorationSet.empty,
            };
          },

          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(wikiLinkSuggestionPluginKey);
            
            // Handle explicit close
            if (meta?.close) {
              const nextState = {
                active: false,
                query: '',
                range: null,
                decorations: DecorationSet.empty,
              };
              onStateChange?.(nextState);
              return nextState;
            }

            // Check for [[ pattern
            const { selection } = newState;
            const { $from } = selection;
            
            // Get text before cursor
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, '\ufffc');
            
            // Find [[ pattern
            const match = textBefore.match(/\[\[([^\]]*?)$/);
            
            if (match) {
              const query = match[1];
              const from = $from.pos - match[0].length;
              const to = $from.pos;

              const decorations = DecorationSet.create(newState.doc, [
                Decoration.inline(from, to, {
                  class: 'wiki-link-typing',
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

            // No match, deactivate
            if (prev.active) {
              const nextState = {
                active: false,
                query: '',
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
            const pluginState = wikiLinkSuggestionPluginKey.getState(view.state);
            
            if (!pluginState?.active) {
              return false;
            }

            // Close on Escape
            if (event.key === 'Escape') {
              view.dispatch(
                view.state.tr.setMeta(wikiLinkSuggestionPluginKey, { close: true })
              );
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
