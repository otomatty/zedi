import {
  InfiniteQueryObserver,
  type InfiniteData,
  type InfiniteQueryObserverOptions,
  type InfiniteQueryObserverResult,
  type QueryKey,
} from "@tanstack/query-core";
import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from "hono/jsx/dom";
import { QueryClientContext } from "./query";

/** Options for `useInfiniteQuery` (cursor-paginated lists). */
export interface UseInfiniteQueryOptions<TPage, TParam> {
  queryKey: QueryKey;
  initialPageParam: TParam;
  queryFn: (context: { pageParam: TParam }) => Promise<TPage>;
  getNextPageParam: (lastPage: TPage) => TParam | undefined;
}

/**
 * hono/jsx/dom binding for TanStack Query's infinite (cursor) queries.
 * TanStack Query の無限スクロール（カーソル）クエリを hono/jsx/dom から使うアダプタ。
 */
export function useInfiniteQuery<TPage, TParam>(
  options: UseInfiniteQueryOptions<TPage, TParam>,
): InfiniteQueryObserverResult<InfiniteData<TPage, TParam>> {
  const client = useContext(QueryClientContext);
  if (!client) throw new Error("useInfiniteQuery requires QueryClientContext.Provider");
  const toObserverOptions = (): InfiniteQueryObserverOptions<
    TPage,
    Error,
    InfiniteData<TPage, TParam>,
    QueryKey,
    TParam
  > => ({
    queryKey: options.queryKey,
    initialPageParam: options.initialPageParam,
    // query-core types pageParam as unknown on the shared context; it is always TParam here.
    queryFn: (context) => options.queryFn({ pageParam: context.pageParam as TParam }),
    getNextPageParam: options.getNextPageParam,
  });
  const [observer] = useState(
    () =>
      new InfiniteQueryObserver<TPage, Error, InfiniteData<TPage, TParam>, QueryKey, TParam>(
        client,
        toObserverOptions(),
      ),
  );

  useEffect(() => {
    observer.setOptions(toObserverOptions());
  });

  const subscribe = useCallback((notify: () => void) => observer.subscribe(notify), [observer]);
  return useSyncExternalStore(subscribe, () => observer.getCurrentResult());
}
