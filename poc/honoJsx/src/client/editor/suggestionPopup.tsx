import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { createRoot, type Root } from "hono/jsx/dom/client";
import { moveActive } from "../lib/listbox";
import { SuggestionList } from "./SuggestionList";

/**
 * Tiptap Suggestion renderer that draws the popup with hono/jsx/dom and positions it with
 * Floating UI. Keyboard state lives here, outside the component, so the editor keeps focus.
 * Tiptap の候補ポップアップを hono/jsx/dom で描画し、Floating UI で配置するレンダラー。
 */
export function createSuggestionRenderer<I>(label: (item: I) => string, empty: string) {
  return () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;
    let current: SuggestionProps<I, I> | null = null;
    let active = 0;

    const paint = () => {
      const props = current;
      if (!root || !props || !container) return;
      root.render(
        <SuggestionList
          items={props.items}
          active={active}
          label={label}
          empty={empty}
          onPick={(index) => {
            const item = props.items[index];
            if (item) props.command(item);
          }}
        />,
      );
      const rect = props.clientRect?.();
      const el = container;
      if (rect) {
        void computePosition({ getBoundingClientRect: () => rect }, el, {
          placement: "bottom-start",
          middleware: [offset(6), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => Object.assign(el.style, { left: `${x}px`, top: `${y}px` }));
      }
    };

    return {
      onStart(props: SuggestionProps<I, I>) {
        current = props;
        active = 0;
        container = document.createElement("div");
        container.className = "suggestion-popup";
        document.body.append(container);
        root = createRoot(container);
        paint();
      },
      onUpdate(props: SuggestionProps<I, I>) {
        current = props;
        active = Math.min(active, Math.max(props.items.length - 1, 0));
        paint();
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        if (!current) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          active = moveActive(active, event.key === "ArrowDown" ? 1 : -1, current.items.length);
          paint();
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = current.items[active];
          if (item) current.command(item);
          return item !== undefined;
        }
        return false;
      },
      onExit() {
        root?.unmount();
        container?.remove();
        root = null;
        container = null;
        current = null;
      },
    };
  };
}
