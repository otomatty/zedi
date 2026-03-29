/**
 * 連鎖する Drizzle 風クエリを順番に解決するプロキシベースの DB モック。
 * Proxy-based DB mock for route tests (results[i] = i-th query result).
 */

/** One recorded DB chain (for debugging tests). / デバッグ用のチェーン情報 */
export interface ChainInfo {
  /** Top-level method name (e.g. select). */
  startMethod: string;
  startArgs: unknown[];
  ops: { method: string; args: unknown[] }[];
}

/**
 * results[0] が最初のクエリ結果、results[1] が次、…と対応する。
 */
export function createMockDb(results: unknown[]) {
  let chainIndex = 0;
  const chains: ChainInfo[] = [];

  function makeChainProxy(
    resultIdx: number,
    ops: { method: string; args: unknown[] }[],
  ): Promise<unknown> & Record<string, (...args: unknown[]) => unknown> {
    return new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
      get(_, prop: string) {
        if (prop === "then") {
          const result = results[resultIdx];
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "catch") {
          const result = results[resultIdx];
          return (reject?: (e: unknown) => unknown) => Promise.resolve(result).catch(reject);
        }
        if (prop === "finally") {
          const result = results[resultIdx];
          return (fn?: () => void) => Promise.resolve(result).finally(fn);
        }
        return (...args: unknown[]) => {
          ops.push({ method: prop, args });
          return makeChainProxy(resultIdx, ops);
        };
      },
    }) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
  }

  const db = new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
    get(_, prop: string) {
      if (prop === "transaction") {
        return (fn: (tx: typeof db) => Promise<unknown>) => fn(db);
      }
      return (...args: unknown[]) => {
        const idx = chainIndex++;
        const ops: { method: string; args: unknown[] }[] = [];
        chains.push({ startMethod: prop, startArgs: args, ops });
        return makeChainProxy(idx, ops);
      };
    },
  });

  return { db, chains };
}
