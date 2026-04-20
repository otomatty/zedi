/**
 * Unit tests for `calculateBaseline` (scripts/inspect-ai-models-cost.lib.ts).
 *
 * Covers the regression from issue #609 where `Math.min(...[])` evaluates to
 * `Infinity` and poisons every downstream multiplier with `0`.
 *
 * scripts/inspect-ai-models-cost.lib.ts の `calculateBaseline` を対象とした
 * 単体テスト。`Math.min(...[])` が `Infinity` を返し、後続の倍率計算がすべて
 * `0` になる #609 のリグレッションを検証する。
 */
import { describe, it, expect } from "vitest";
import { calculateBaseline } from "./inspect-ai-models-cost.lib.js";

describe("calculateBaseline (issue #609)", () => {
  it("returns 1 when the array is empty (guards Math.min(...[]) === Infinity)", () => {
    const baseline = calculateBaseline([]);
    expect(baseline).toBe(1);
    expect(Number.isFinite(baseline)).toBe(true);
  });

  it("returns 1 when every value is zero", () => {
    expect(calculateBaseline([0, 0, 0])).toBe(1);
  });

  it("returns 1 when every value is non-positive (zero or negative)", () => {
    // 負値は本来想定外だが、防御的に fallback する。
    // Negative values are not expected but we still fall back defensively.
    expect(calculateBaseline([0, -1, -5])).toBe(1);
  });

  it("returns the minimum positive value when at least one positive exists", () => {
    expect(calculateBaseline([10, 5, 20])).toBe(5);
  });

  it("ignores zeros and negatives when picking the minimum positive", () => {
    expect(calculateBaseline([0, 7, -3, 2, 9])).toBe(2);
  });

  it("returns 1 when the computed minimum is not finite (defensive)", () => {
    // すべて非有限値の場合も fallback。Math.min(Infinity) === Infinity のため
    // `Number.isFinite` チェックで弾く必要がある。
    // Even if a caller somehow passes non-finite values we must not propagate them.
    expect(calculateBaseline([Number.POSITIVE_INFINITY])).toBe(1);
  });

  it("downstream multiplier calculation does not collapse to 0 when input is empty", () => {
    // Regression guard: 以前は baseline=Infinity になり、倍率が Math.round(x / Infinity) = 0 になっていた。
    // Previously baseline was Infinity, so `Math.round(x / baseline)` yielded 0 for every row.
    const baseline = calculateBaseline([]);
    const sampleInput = 42;
    const multiplier = Math.round(sampleInput / baseline);
    expect(multiplier).toBe(42);
    expect(multiplier).not.toBe(0);
  });
});
