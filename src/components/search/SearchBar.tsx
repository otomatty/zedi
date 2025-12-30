import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePageStore } from '@/stores/pageStore';
import { getContentPreview } from '@/lib/contentUtils';
import { formatTimeAgo } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  className?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ className }) => {
  const navigate = useNavigate();
  const { searchPages } = usePageStore();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const results = query.trim() ? searchPages(query) : [];

  const handleSelect = (pageId: string) => {
    navigate(`/page/${pageId}`);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="ページを検索..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-10 pr-10 bg-muted/50 border-muted focus:bg-background"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.trim() && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-popover border border-border rounded-lg shadow-elevated overflow-hidden animate-slide-down">
            {results.length > 0 ? (
              <ul className="max-h-80 overflow-y-auto py-1">
                {results.slice(0, 10).map((page) => (
                  <li key={page.id}>
                    <button
                      onClick={() => handleSelect(page.id)}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="font-medium text-sm line-clamp-1">
                        {page.title || '無題のページ'}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground line-clamp-1 flex-1">
                          {getContentPreview(page.content, 60)}
                        </span>
                        <span className="text-xs text-muted-foreground/60 shrink-0">
                          {formatTimeAgo(page.updatedAt)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                「{query}」に一致するページが見つかりません
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SearchBar;
