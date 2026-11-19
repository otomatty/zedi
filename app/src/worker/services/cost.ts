/**
 * D1 cost of a request: rows read/written and SQL time, as reported by D1 itself.
 * リクエストの D1 コスト（D1 が返す読み書き行数と SQL 時間）。
 */
export interface D1Cost {
  rowsRead: number;
  rowsWritten: number;
  durationMs: number;
}

/** Creates an empty cost accumulator. */
export const newCost = (): D1Cost => ({ rowsRead: 0, rowsWritten: 0, durationMs: 0 });

/** Adds one statement's `meta` to the accumulator. */
export function addCost(
  cost: D1Cost,
  meta: { rows_read?: number; rows_written?: number; duration?: number },
): void {
  cost.rowsRead += meta.rows_read ?? 0;
  cost.rowsWritten += meta.rows_written ?? 0;
  cost.durationMs += meta.duration ?? 0;
}

/**
 * Like `statement.first()`, but records D1's cost (`first()` does not expose `meta`).
 * `first()` と同じだが、D1 のコストも記録する（`first()` は `meta` を返さないため）。
 */
export async function firstWithCost<T>(
  statement: D1PreparedStatement,
  cost?: D1Cost,
): Promise<T | null> {
  const result = await statement.all<T>();
  if (cost) addCost(cost, result.meta);
  return result.results[0] ?? null;
}
