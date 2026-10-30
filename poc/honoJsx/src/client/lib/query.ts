import {
  QueryObserver,
  type QueryClient,
  type QueryKey,
  type QueryObserverResult,
} from "@tanstack/query-core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "hono/jsx/dom";

/**
 * Provides the shared `QueryClient` to `useQuery`.
 * `useQuery` に共有の `QueryClient` を渡すコンテキスト。
 */
export const QueryClientContext = createContext<QueryClient | null>(null);

/** Options accepted by `useQuery` (a subset of TanStack Query's observer options). */
export interface UseQueryOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  staleTime?: number;
}

/**
 * Thin hono/jsx/dom binding for `@tanstack/query-core` (caching, dedupe, refetch),
 * built on `useSyncExternalStore` like the official React adapter.
 * `@tanstack/query-core` を hono/jsx/dom から使う薄いアダプタ。
 */
export function useQuery<T>(options: UseQueryOptions<T>): QueryObserverResult<T> {
  const client = useContext(QueryClientContext);
  if (!client) throw new Error("useQuery requires QueryClientContext.Provider");
  const [observer] = useState(() => new QueryObserver<T>(client, options));

  // Like the official React adapter: hand the latest options to the observer after every
  // render. setOptions() is a no-op unless the key or options actually changed.
  useEffect(() => {
    observer.setOptions(options);
  });

  const subscribe = useCallback((notify: () => void) => observer.subscribe(notify), [observer]);
  // getCurrentResult() is referentially stable between notifications, as useSyncExternalStore requires.
  return useSyncExternalStore(subscribe, () => observer.getCurrentResult());
}
