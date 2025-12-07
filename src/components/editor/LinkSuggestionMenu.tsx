// Link suggestion popup component
import { For, Show, onCleanup, createEffect } from "solid-js";

export interface LinkSuggestion {
  id: string;
  title: string;
  exists: boolean;
}

export interface LinkSuggestionMenuProps {
  isOpen: boolean;
  position: { top: number; left: number };
  suggestions: LinkSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: LinkSuggestion) => void;
  onClose: () => void;
  inputValue: string;
}

export function LinkSuggestionMenu(props: LinkSuggestionMenuProps) {
  let menuRef: HTMLDivElement | undefined;

  // Close on click outside
  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      props.onClose();
    }
  };

  createEffect(() => {
    if (props.isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  return (
    <Show when={props.isOpen}>
      <div
        ref={menuRef}
        class="absolute z-popover bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden min-w-[200px] max-w-[300px] animate-[scale-in_0.15s_ease-out]"
        style={{
          top: `${props.position.top}px`,
          left: `${props.position.left}px`,
        }}
      >
        {/* Header */}
        <div class="px-3 py-2 bg-[var(--bg-base)] border-b border-[var(--border-subtle)]">
          <span class="text-xs font-medium text-[var(--text-tertiary)]">
            リンク先を選択
          </span>
        </div>

        {/* Suggestions list */}
        <div class="max-h-[200px] overflow-y-auto">
          <Show
            when={props.suggestions.length > 0}
            fallback={
              <div class="px-3 py-4 text-center">
                <p class="text-sm text-[var(--text-secondary)]">
                  "{props.inputValue}" を新規作成
                </p>
                <p class="text-xs text-[var(--text-tertiary)] mt-1">
                  Enterで新しいカードへのリンクを作成
                </p>
              </div>
            }
          >
            <For each={props.suggestions}>
              {(suggestion, index) => (
                <button
                  class={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
                    index() === props.selectedIndex
                      ? "bg-primary-100 dark:bg-primary-900/30"
                      : "hover:bg-[var(--bg-base)]"
                  }`}
                  onClick={() => props.onSelect(suggestion)}
                >
                  <span
                    class={`w-2 h-2 rounded-full ${
                      suggestion.exists
                        ? "bg-success-500"
                        : "bg-[var(--text-tertiary)]"
                    }`}
                  />
                  <span class="text-sm text-[var(--text-primary)] truncate">
                    {suggestion.title}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>

        {/* Footer hint */}
        <div class="px-3 py-1.5 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] flex items-center gap-2">
          <kbd class="px-1.5 py-0.5 text-xs bg-[var(--bg-card)] border border-[var(--border-default)] rounded">
            ↑↓
          </kbd>
          <span class="text-xs text-[var(--text-tertiary)]">選択</span>
          <kbd class="px-1.5 py-0.5 text-xs bg-[var(--bg-card)] border border-[var(--border-default)] rounded">
            Enter
          </kbd>
          <span class="text-xs text-[var(--text-tertiary)]">確定</span>
          <kbd class="px-1.5 py-0.5 text-xs bg-[var(--bg-card)] border border-[var(--border-default)] rounded">
            Esc
          </kbd>
          <span class="text-xs text-[var(--text-tertiary)]">閉じる</span>
        </div>
      </div>
    </Show>
  );
}

export default LinkSuggestionMenu;
