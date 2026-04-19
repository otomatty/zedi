/**
 * Pure helpers for scripts/inspect-ai-models-cost.ts.
 *
 * The script itself is a thin driver (DB access + formatting). Pure calculation
 * logic lives here so it can be unit-tested without spinning up a DB client.
 *
 * scripts/inspect-ai-models-cost.ts 用の純粋関数ヘルパー。
 * スクリプト本体は DB アクセスと表示を担当し、計算ロジックだけを
 * 切り出すことで DB を起動せずに単体テストできるようにする。
 */

/**
 * Calculate the multiplier baseline (= minimum positive `input_cost_units`).
 *
 * Returns `1` as a safe fallback when:
 *   - the input is empty,
 *   - every value is `<= 0` (so there is no positive minimum to find), or
 *   - the computed minimum is not a finite positive number for any reason.
 *
 * Implemented as a single-pass `reduce` to avoid both the `Math.min(...[])
 * === Infinity` edge case that motivated #609 and the `RangeError` risk of
 * spreading a very large array into `Math.min`.
 *
 * マルチプライヤ表示用のベースライン（= 最小の正の `input_cost_units`）を計算する。
 * 入力が空、すべて `<= 0`、または最小値が有限正数でない場合は
 * 安全なフォールバック値として `1` を返し、以降の倍率計算が 0 や
 * Infinity になるのを防ぐ (#609)。`reduce` の 1 パスで求めることで、
 * 巨大配列を `Math.min(...arr)` にスプレッドした際の `RangeError` も回避する。
 *
 * @param inputCostUnits - `ai_models.input_cost_units` values to inspect.
 * @returns Minimum positive value, or `1` when no valid minimum exists.
 */
export function calculateBaseline(inputCostUnits: readonly number[]): number {
  const minInput = inputCostUnits.reduce(
    (min, v) => (v > 0 && v < min ? v : min),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(minInput) ? minInput : 1;
}
