/**
 *
 */
export function SearchResultsLoadingSkeleton() {
  return (
    <div className="max-w-3xl space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="border-border flex animate-pulse gap-4 rounded-lg border p-4">
          <div className="bg-muted h-20 w-28 shrink-0 rounded" />
          <div className="flex-1 space-y-2">
            <div className="bg-muted h-5 w-1/3 rounded" />
            <div className="bg-muted h-4 w-full rounded" />
            <div className="bg-muted h-4 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
