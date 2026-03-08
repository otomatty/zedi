/**
 * syncAiModelsPricing の単体テスト（純粋関数）
 */
import { describe, it, expect } from "vitest";
import {
  lookupOpenRouterKeys,
  findPricing,
  findReferencePricePerToken,
  calculateCostUnits,
} from "./syncAiModelsPricing.js";
import type { OpenRouterPricing } from "./syncAiModelsTypes.js";

function pricing(prompt: string, completion: string): OpenRouterPricing {
  return { prompt, completion };
}

describe("lookupOpenRouterKeys", () => {
  it("openai: 単一キー", () => {
    expect(lookupOpenRouterKeys("openai", "gpt-4")).toEqual(["openai/gpt-4"]);
  });

  it("anthropic: バージョン X-Y があるとドット版も追加", () => {
    const keys = lookupOpenRouterKeys("anthropic", "claude-sonnet-4-6");
    expect(keys).toContain("anthropic/claude-sonnet-4-6");
    expect(keys).toContain("anthropic/claude-sonnet-4.6");
    expect(keys.length).toBe(2);
  });

  it("google: プレフィックスは google", () => {
    expect(lookupOpenRouterKeys("google", "gemini-2.0-flash")).toContain("google/gemini-2.0-flash");
  });
});

describe("findPricing", () => {
  it("完全一致で返す", () => {
    const map = new Map<string, OpenRouterPricing>([
      ["anthropic/claude-sonnet-4.6", pricing("0.001", "0.005")],
    ]);
    expect(findPricing(map, ["anthropic/claude-sonnet-4.6"])).toEqual(pricing("0.001", "0.005"));
  });

  it("候補の順で最初にマッチしたものを返す", () => {
    const map = new Map<string, OpenRouterPricing>([
      ["key-a", pricing("1", "1")],
      ["key-b", pricing("2", "2")],
    ]);
    expect(findPricing(map, ["key-b", "key-a"])).toEqual(pricing("2", "2"));
  });

  it("完全一致がなければプレフィックス一致を試す", () => {
    const map = new Map<string, OpenRouterPricing>([
      ["anthropic/claude-sonnet-4.6-123", pricing("0.001", "0.005")],
    ]);
    expect(findPricing(map, ["anthropic/claude-sonnet-4.6"])).toEqual(pricing("0.001", "0.005"));
  });

  it("見つからなければ undefined", () => {
    const map = new Map<string, OpenRouterPricing>([]);
    expect(findPricing(map, ["unknown/key"])).toBeUndefined();
  });
});

describe("findReferencePricePerToken", () => {
  it("参照モデルがあればその prompt 価格を返す", () => {
    const map = new Map<string, OpenRouterPricing>([
      ["anthropic/claude-sonnet-4.6", pricing("0.000003", "0.000015")],
    ]);
    expect(findReferencePricePerToken(map)).toBe(0.000003);
  });

  it("参照モデルがなければ中央値", () => {
    const map = new Map<string, OpenRouterPricing>([
      ["a", pricing("0.001", "0.001")],
      ["b", pricing("0.003", "0.003")],
      ["c", pricing("0.002", "0.002")],
    ]);
    const result = findReferencePricePerToken(map);
    expect(result).toBe(0.002);
  });

  it("空の Map は 0", () => {
    expect(findReferencePricePerToken(new Map())).toBe(0);
  });
});

describe("calculateCostUnits", () => {
  it("referencePricePerToken が 0 以下なら DEFAULT_COST_UNITS", () => {
    expect(calculateCostUnits(pricing("0.001", "0.005"), 0)).toEqual({
      input: 1,
      output: 1,
    });
  });

  it("参照価格に対する倍率で CU を計算（最低 1）", () => {
    // 参照 0.000003 の 2 倍なら input 200 付近（REFERENCE_CU=100 なので 100 * 2）
    const result = calculateCostUnits(pricing("0.000006", "0.00003"), 0.000003);
    expect(result.input).toBe(200);
    expect(result.output).toBeGreaterThanOrEqual(1);
  });

  it("非常に安い価格でも input/output は最低 1", () => {
    const result = calculateCostUnits(pricing("0.0000001", "0.0000001"), 0.001);
    expect(result.input).toBe(1);
    expect(result.output).toBe(1);
  });
});
