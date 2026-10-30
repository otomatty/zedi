/** D1 allows at most 100 bound parameters per SQL statement. */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Splits rows for multi-row INSERTs so each statement binds at most `maxParams` values.
 * 複数行 INSERT を、1 文あたりのバインド数が `maxParams` 以下になるよう分割する。
 */
export function chunkForParams<T>(
  rows: readonly T[],
  columnsPerRow: number,
  maxParams = D1_MAX_BOUND_PARAMS,
): T[][] {
  if (columnsPerRow < 1 || columnsPerRow > maxParams) {
    throw new RangeError(`columnsPerRow must be between 1 and ${maxParams}`);
  }
  const perChunk = Math.floor(maxParams / columnsPerRow);
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += perChunk) chunks.push(rows.slice(i, i + perChunk));
  return chunks;
}
