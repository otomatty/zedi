// Link Suggestion Extension for Tiptap
// Highlights existing card titles in the editor with dotted underlines
// Uses Aho-Corasick backend for fast pattern matching

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { invoke } from "@tauri-apps/api/core";

export interface LinkSuggestion {
  title: string;
  start: number;
  end: number;
}

export interface LinkSuggestionOptions {
  onSuggestionClick?: (title: string, start: number, end: number) => void;
  debounceMs?: number;
}

const pluginKey = new PluginKey("linkSuggestion");

export const LinkSuggestionExtension = Extension.create<LinkSuggestionOptions>({
  name: "linkSuggestion",

  addOptions() {
    return {
      onSuggestionClick: undefined,
      debounceMs: 200,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    let debounceTimeout: number | undefined;

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, decorationSet) {
            // Map decorations through transaction
            if (tr.docChanged) {
              return decorationSet.map(tr.mapping, tr.doc);
            }
            // Check if we have new decorations from meta
            const newDecorations = tr.getMeta(pluginKey);
            if (newDecorations !== undefined) {
              return newDecorations;
            }
            return decorationSet;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            if (target.classList.contains("suggested-link")) {
              const title = target.getAttribute("data-suggestion-title");
              const start = parseInt(target.getAttribute("data-suggestion-start") || "0");
              const end = parseInt(target.getAttribute("data-suggestion-end") || "0");
              
              if (title && extension.options.onSuggestionClick) {
                extension.options.onSuggestionClick(title, start, end);
                return true;
              }
            }
            return false;
          },
        },
        view(editorView) {
          const updateDecorations = async () => {
            const text = editorView.state.doc.textContent;
            
            if (!text.trim()) {
              const tr = editorView.state.tr.setMeta(pluginKey, DecorationSet.empty);
              editorView.dispatch(tr);
              return;
            }

            try {
              const suggestions = await invoke<LinkSuggestion[]>("get_link_suggestions", {
                text,
              });

              // Create decorations for each suggestion
              const decorations: Decoration[] = [];
              
              // We need to map text positions to document positions
              // This is simplified - assumes continuous text
              let textPos = 0;
              editorView.state.doc.descendants((node, pos) => {
                if (node.isText && node.text) {
                  const nodeText = node.text;
                  
                  for (const suggestion of suggestions) {
                    // Check if this suggestion falls within this text node
                    if (suggestion.start >= textPos && suggestion.end <= textPos + nodeText.length) {
                      const from = pos + (suggestion.start - textPos);
                      const to = pos + (suggestion.end - textPos);
                      
                      decorations.push(
                        Decoration.inline(from, to, {
                          class: "suggested-link",
                          "data-suggestion-title": suggestion.title,
                          "data-suggestion-start": suggestion.start.toString(),
                          "data-suggestion-end": suggestion.end.toString(),
                        })
                      );
                    }
                  }
                  
                  textPos += nodeText.length;
                }
                return true;
              });

              const decorationSet = DecorationSet.create(editorView.state.doc, decorations);
              const tr = editorView.state.tr.setMeta(pluginKey, decorationSet);
              editorView.dispatch(tr);
            } catch (error) {
              console.error("Failed to get link suggestions:", error);
            }
          };

          // Debounced update
          const scheduleUpdate = () => {
            if (debounceTimeout) {
              clearTimeout(debounceTimeout);
            }
            debounceTimeout = window.setTimeout(updateDecorations, extension.options.debounceMs);
          };

          // Initial update
          scheduleUpdate();

          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) {
                scheduleUpdate();
              }
            },
            destroy() {
              if (debounceTimeout) {
                clearTimeout(debounceTimeout);
              }
            },
          };
        },
      }),
    ];
  },
});

export default LinkSuggestionExtension;
