import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react';
import { Editor } from '@tiptap/core';
import { usePageStore } from '@/stores/pageStore';
import { cn } from '@/lib/utils';
import { FileText, Plus } from 'lucide-react';

export interface SuggestionItem {
  id: string;
  title: string;
  exists: boolean;
}

interface WikiLinkSuggestionProps {
  editor: Editor;
  query: string;
  range: { from: number; to: number };
  onSelect: (item: SuggestionItem) => void;
  onClose: () => void;
}

export interface WikiLinkSuggestionHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const WikiLinkSuggestion = forwardRef<WikiLinkSuggestionHandle, WikiLinkSuggestionProps>(
  ({ query, onSelect, onClose }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { pages, searchPages } = usePageStore();

    // Get matching pages
    const getItems = useCallback((): SuggestionItem[] => {
      const normalizedQuery = query.toLowerCase().trim();
      
      // Get existing pages that match
      const matchingPages = pages
        .filter((p) => !p.isDeleted && p.title.toLowerCase().includes(normalizedQuery))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          title: p.title || '無題のページ',
          exists: true,
        }));

      // If query doesn't match any existing page exactly, add create option
      const exactMatch = pages.find(
        (p) => !p.isDeleted && p.title.toLowerCase() === normalizedQuery
      );

      const items: SuggestionItem[] = [...matchingPages];

      if (query.trim() && !exactMatch) {
        items.push({
          id: 'create-new',
          title: query.trim(),
          exists: false,
        });
      }

      return items;
    }, [query, pages]);

    const items = getItems();

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [query]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          onSelect(item);
        }
      },
      [items, onSelect]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
          return true;
        }

        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
          return true;
        }

        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }

        if (event.key === 'Escape') {
          onClose();
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return null;
    }

    return (
      <div className="bg-popover border border-border rounded-lg shadow-elevated overflow-hidden min-w-[200px] max-w-[300px] animate-fade-in">
        <div className="p-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => selectItem(index)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors',
                index === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted'
              )}
            >
              {item.exists ? (
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <Plus className="h-4 w-4 text-primary shrink-0" />
              )}
              <span className="truncate">
                {item.exists ? item.title : `"${item.title}" を作成`}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }
);

WikiLinkSuggestion.displayName = 'WikiLinkSuggestion';
