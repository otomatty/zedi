/**
 * Listbox shown in the Tiptap suggestion popup (WikiLink targets, slash commands).
 * Tiptap の候補ポップアップに出す一覧（WikiLink 先・スラッシュコマンド）。
 */
export function SuggestionList<I>(props: {
  items: readonly I[];
  active: number;
  label: (item: I) => string;
  empty: string;
  onPick: (index: number) => void;
}) {
  if (props.items.length === 0) return <p class="suggestion-empty">{props.empty}</p>;
  return (
    <ul role="listbox" class="suggestion-list">
      {props.items.map((item, index) => (
        <li
          role="option"
          aria-selected={index === props.active ? "true" : "false"}
          class="suggestion-option"
          // mousedown keeps focus in the editor; click would blur it first.
          onMouseDown={(e: MouseEvent) => (e.preventDefault(), props.onPick(index))}
        >
          {props.label(item)}
        </li>
      ))}
    </ul>
  );
}
