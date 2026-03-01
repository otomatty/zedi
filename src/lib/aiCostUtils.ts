import type { AIModel } from "@/types/ai";

/** Sonnet モデルがリストにない場合のフォールバック値（input_cost_units） */
const SONNET_BASELINE_FALLBACK = 100;

/**
 * モデル一覧から Sonnet の inputCostUnits を基準値として取得する。
 * id または displayName に "sonnet" を含むモデルを探す。
 */
export function getSonnetBaseline(models: AIModel[]): number {
  const sonnet = models.find(
    (m) =>
      m.id.toLowerCase().includes("sonnet") ||
      (m.displayName ?? "").toLowerCase().includes("sonnet"),
  );
  return sonnet?.inputCostUnits ?? SONNET_BASELINE_FALLBACK;
}

/**
 * Sonnet を 1x 基準として、モデルのコスト倍率ラベルを返す。
 * Sonnet より安いモデルは小数表記（0.5x, 0.02x 等）、高いモデルは整数表記（5x, 25x 等）。
 */
export function formatCostMultiplierLabel(inputCostUnits: number, baseline: number): string {
  if (inputCostUnits <= 0 || baseline <= 0) return "1x";
  const ratio = inputCostUnits / baseline;
  if (ratio >= 1) {
    return `${Math.round(ratio)}x`;
  }
  if (ratio >= 0.1) return `${ratio.toFixed(1)}x`;
  if (ratio >= 0.01) return `${ratio.toFixed(2)}x`;
  return ratio < 0.001 ? "<0.01x" : `${ratio.toFixed(2)}x`;
}
