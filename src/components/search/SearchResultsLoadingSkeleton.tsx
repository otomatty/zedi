export function SearchResultsLoadingSkeleton() {
  return (
    <div className="max-w-3xl space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex animate-pulse gap-4 rounded-lg border border-border p-4">
          <div className="h-16 w-24 shrink-0 rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-1/3 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
