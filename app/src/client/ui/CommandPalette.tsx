import { useEffect, useId, useMemo, useRef, useState } from "hono/jsx/dom";
import { filterItems, moveActive, type ListItem } from "../lib/listbox";

/** Props of the command palette. */
export interface CommandPaletteProps<T extends ListItem> {
  open: boolean;
  items: readonly T[];
  placeholder?: string;
  /** Set to false when `items` are already filtered by the server (e.g. full-text search). */
  filterLocally?: boolean;
  onQueryChange?(query: string): void;
  onSelect(item: T): void;
  onClose(): void;
}

/**
 * Keyboard-first command palette built on the native `<dialog>` element and the
 * WAI-ARIA combobox + listbox pattern (no UI library).
 * ネイティブ `<dialog>` と ARIA の combobox/listbox パターンで作ったコマンドパレット。
 */
export function CommandPalette<T extends ListItem>(props: CommandPaletteProps<T>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const baseId = useId();
  const filterLocally = props.filterLocally ?? true;
  const visible = useMemo(
    () => (filterLocally ? filterItems(props.items, query) : [...props.items]),
    [props.items, query, filterLocally],
  );
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!props.open && dialog.open) {
      dialog.close();
    }
  }, [props.open]);

  const choose = (index: number) => {
    const item = visible[index];
    if (item) props.onSelect(item);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        moveActive(current, event.key === "ArrowDown" ? 1 : -1, visible.length),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      class="palette"
      aria-label="コマンドパレット"
      onCancel={(e: Event) => (e.preventDefault(), props.onClose())}
    >
      <input
        ref={inputRef}
        class="palette-input"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${baseId}-list`}
        aria-activedescendant={visible.length > 0 ? optionId(active) : undefined}
        placeholder={props.placeholder ?? "ページを検索…"}
        value={query}
        onInput={(e: Event) => {
          const value = (e.target as HTMLInputElement).value;
          setQuery(value);
          setActive(0);
          props.onQueryChange?.(value);
        }}
        onKeyDown={onKeyDown}
      />
      <ul id={`${baseId}-list`} role="listbox" class="palette-list">
        {visible.map((item, index) => (
          <li
            key={item.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === active ? "true" : "false"}
            class="palette-option"
            onMouseMove={() => setActive(index)}
            onClick={() => choose(index)}
          >
            {item.label}
          </li>
        ))}
      </ul>
    </dialog>
  );
}
