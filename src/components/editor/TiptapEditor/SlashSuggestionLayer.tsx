import React, {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useRef,
} from "react";
import type { Editor } from "@tiptap/core";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import {
  slashCommandItems,
  filterSlashCommandItems,
  type SlashCommandItem,
} from "./slashCommandItems";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  Table,
  ImagePlus,
  GitBranch,
  Sigma,
  Radical,
} from "lucide-react";

/** Map icon name string → Lucide component */
const iconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  Table,
  ImagePlus,
  GitBranch,
  Sigma,
  Radical,
};

export interface SlashSuggestionHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashSuggestionLayerProps {
  editor: Editor | null;
  suggestionState: SlashSuggestionState | null;
  position: { top: number; left: number } | null;
  suggestionRef: React.RefObject<SlashSuggestionHandle>;
  onClose: () => void;
}

const SlashSuggestionMenu = forwardRef<
  SlashSuggestionHandle,
  {
    editor: Editor;
    query: string;
    range: { from: number; to: number };
    onClose: () => void;
  }
>(({ editor, query, range, onClose }, ref) => {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = filterSlashCommandItems(slashCommandItems, query, editor, t);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        item.action(editor, range);
        onClose();
      }
    },
    [items, editor, range, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const buttons = listRef.current.querySelectorAll("button");
    const target = buttons[selectedIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
        return true;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
        return true;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return true;
      }

      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="bg-popover border border-border rounded-lg shadow-elevated overflow-hidden min-w-[240px] animate-fade-in">
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {t("editor.slashNoResults")}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="bg-popover border border-border rounded-lg shadow-elevated overflow-hidden min-w-[240px] max-w-[320px] max-h-[320px] overflow-y-auto animate-fade-in"
      role="listbox"
      aria-label={t("editor.slashMenuAriaLabel")}
    >
      <div className="p-1">
        {items.map((item, index) => {
          const Icon = iconMap[item.icon];
          return (
            <button
              key={item.id}
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => selectItem(index)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
            >
              {Icon && (
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{t(`editor.slash.${item.id}.title`)}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {t(`editor.slash.${item.id}.description`)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

SlashSuggestionMenu.displayName = "SlashSuggestionMenu";

export const SlashSuggestionLayer: React.FC<SlashSuggestionLayerProps> = ({
  editor,
  suggestionState,
  position,
  suggestionRef,
  onClose,
}) => {
  if (!suggestionState?.active || !position || !editor) return null;

  return (
    <div
      className="absolute z-50"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <SlashSuggestionMenu
        ref={suggestionRef}
        editor={editor}
        query={suggestionState.query}
        range={suggestionState.range!}
        onClose={onClose}
      />
    </div>
  );
};
