import { Search } from "lucide-react";

interface SearchResultsEmptyStateProps {
  title?: string;
  description?: string;
}

/**
 *
 */
export function SearchResultsEmptyState({ title, description }: SearchResultsEmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <Search className="text-muted-foreground/40 mx-auto mb-4 h-12 w-12" />
      {title && (
        <p className={description ? "mb-1 text-lg font-medium" : "text-muted-foreground"}>
          {title}
        </p>
      )}
      {description && <p className="text-muted-foreground text-sm">{description}</p>}
    </div>
  );
}
