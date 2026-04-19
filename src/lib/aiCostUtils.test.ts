import { describe, it, expect } from "vitest";
import type { AIModel } from "@/types/ai";
import { getSonnetBaseline, formatCostMultiplierLabel } from "./aiCostUtils";

/**
 * モデルを簡潔に作るテストヘルパー。
 * Small helper to build AIModel fixtures succinctly.
 */
function model(overrides: Partial<AIModel> & { id: string }): AIModel {
  return {
    provider: "anthropic",
    modelId: overrides.id,
    displayName: overrides.id,
    tierRequired: "free",
    available: true,
    inputCostUnits: 0,
    outputCostUnits: 0,
    ...overrides,
  };
}

describe("getSonnetBaseline", () => {
  it("id に 'sonnet' を含む正のコストのモデルがあれば、その inputCostUnits を返す", () => {
    const models: AIModel[] = [
      model({ id: "openai:gpt-4o-mini", inputCostUnits: 10 }),
      model({ id: "anthropic:claude-sonnet-4-6", inputCostUnits: 50 }),
      model({ id: "google:gemini-1.5", inputCostUnits: 5 }),
    ];
    expect(getSonnetBaseline(models)).toBe(50);
  });

  it("displayName に 'Sonnet' を含む（id には含まない）モデルを見つけられる（大文字小文字は無視）", () => {
    const models: AIModel[] = [
      model({ id: "anthropic:c4", displayName: "Claude Sonnet 4", inputCostUnits: 33 }),
    ];
    expect(getSonnetBaseline(models)).toBe(33);
  });

  it("Sonnet モデルは存在するが inputCostUnits が 0 のとき、他の正のコストの最小値を返す", () => {
    const models: AIModel[] = [
      model({ id: "anthropic:claude-sonnet-4-6", inputCostUnits: 0 }),
      model({ id: "openai:gpt-4o", inputCostUnits: 20 }),
      model({ id: "openai:gpt-4o-mini", inputCostUnits: 5 }),
    ];
    expect(getSonnetBaseline(models)).toBe(5);
  });

  it("Sonnet モデルは存在するが inputCostUnits が負のとき、他の正のコストの最小値を返す", () => {
    const models: AIModel[] = [
      model({ id: "anthropic:claude-sonnet-4-6", inputCostUnits: -1 }),
      model({ id: "openai:gpt-4o-mini", inputCostUnits: 7 }),
    ];
    expect(getSonnetBaseline(models)).toBe(7);
  });

  it("Sonnet モデルが無く、正のコストのモデルがあれば、その最小値を返す", () => {
    const models: AIModel[] = [
      model({ id: "openai:gpt-4o", inputCostUnits: 20 }),
      model({ id: "openai:gpt-4o-mini", inputCostUnits: 3 }),
      model({ id: "google:gemini-1.5", inputCostUnits: 8 }),
    ];
    expect(getSonnetBaseline(models)).toBe(3);
  });

  it("モデル配列が空のとき、フォールバック値 100 を返す", () => {
    expect(getSonnetBaseline([])).toBe(100);
  });

  it("全てのモデルの inputCostUnits が 0 以下のとき、フォールバック値 100 を返す", () => {
    const models: AIModel[] = [
      model({ id: "openai:gpt-4o-mini", inputCostUnits: 0 }),
      model({ id: "google:gemini-1.5", inputCostUnits: -5 }),
    ];
    expect(getSonnetBaseline(models)).toBe(100);
  });

  it("displayName が undefined の場合でも id 側のマッチングが働く", () => {
    const models: AIModel[] = [
      {
        id: "anthropic:claude-sonnet-4-6",
        provider: "anthropic",
        modelId: "claude-sonnet-4-6",
        displayName: undefined as unknown as string,
        tierRequired: "free",
        available: true,
        inputCostUnits: 42,
        outputCostUnits: 0,
      },
    ];
    expect(getSonnetBaseline(models)).toBe(42);
  });

  it('id・displayName とも undefined の Sonnet 候補がなくてもクラッシュしない（`?? ""` 経路を通す）', () => {
    // `m.displayName ?? ""` が実行されないと NoCoverage / 同値ミュータントが残るため、
    // id が "sonnet" を含まず displayName が undefined の行を明示的に含める。
    // Explicitly exercises the `m.displayName ?? ""` branch: without it, the fallback string
    // is never evaluated and the related mutant stays NoCoverage.
    const models: AIModel[] = [
      {
        id: "openai:gpt-4o-mini",
        provider: "openai",
        modelId: "gpt-4o-mini",
        displayName: undefined as unknown as string,
        tierRequired: "free",
        available: true,
        inputCostUnits: 5,
        outputCostUnits: 0,
      },
    ];
    expect(getSonnetBaseline(models)).toBe(5);
  });

  it("大文字混じりの id でも 'sonnet' を検出できる（toLowerCase が効いていることの検証）", () => {
    // toLowerCase → toUpperCase のミューテーションを検出するには大文字混じりの id が必要。
    // A mixed-case id kills the `toLowerCase` → `toUpperCase` mutation on id lookup.
    const models: AIModel[] = [
      model({ id: "Anthropic:Claude-Sonnet-4-6", inputCostUnits: 77 }),
      model({ id: "openai:gpt-4o-mini", inputCostUnits: 3 }),
    ];
    expect(getSonnetBaseline(models)).toBe(77);
  });

  it("id に 'sonnet' を含まず、大文字混じりの displayName で検出できる（displayName 側 toLowerCase 検証）", () => {
    // id 側の短絡評価を避けつつ、displayName.toLowerCase() の効果を検証する。
    // Exercises the displayName side of the OR and kills the `toLowerCase`→`toUpperCase` mutation.
    const models: AIModel[] = [
      model({
        id: "anthropic:claude-opus",
        displayName: "Claude Sonnet 4.6",
        inputCostUnits: 55,
      }),
      model({ id: "openai:gpt-4o-mini", inputCostUnits: 3 }),
    ];
    expect(getSonnetBaseline(models)).toBe(55);
  });

  it("id に 'sonnet' を含むが displayName は含まない場合でも Sonnet 扱いになる（`||` 短絡）", () => {
    // displayName 単独では検出できないケース。OR → AND のミューテーションを殺す。
    // The id alone matches; a `||`→`&&` mutation would require displayName to match too.
    const models: AIModel[] = [
      model({
        id: "anthropic:claude-sonnet-4-6",
        displayName: "Claude Mid",
        inputCostUnits: 88,
      }),
      model({ id: "openai:gpt-4o-mini", inputCostUnits: 3 }),
    ];
    expect(getSonnetBaseline(models)).toBe(88);
  });
});

describe("formatCostMultiplierLabel", () => {
  it.each([
    { input: 0, baseline: 50 },
    { input: -10, baseline: 50 },
    { input: 50, baseline: 0 },
    { input: 50, baseline: -1 },
    { input: 0, baseline: 0 },
  ])("inputCostUnits=$input, baseline=$baseline のとき '1x' を返す", ({ input, baseline }) => {
    expect(formatCostMultiplierLabel(input, baseline)).toBe("1x");
  });

  it("比率がちょうど 10 のとき、整数表記になる（境界値: ratio >= 10）", () => {
    expect(formatCostMultiplierLabel(100, 10)).toBe("10x");
  });

  it("比率が 10 以上なら整数表記（丸め）になる", () => {
    expect(formatCostMultiplierLabel(254, 10)).toBe("25x");
    expect(formatCostMultiplierLabel(255, 10)).toBe("26x");
  });

  it("比率がちょうど 1 のとき、1 桁小数表記 '1.0x' を返す（境界値: ratio >= 1）", () => {
    expect(formatCostMultiplierLabel(10, 10)).toBe("1.0x");
  });

  it("比率が 1 以上 10 未満のとき、1 桁小数表記を返す", () => {
    expect(formatCostMultiplierLabel(50, 10)).toBe("5.0x");
    expect(formatCostMultiplierLabel(15, 10)).toBe("1.5x");
    expect(formatCostMultiplierLabel(99, 10)).toBe("9.9x");
  });

  it("比率がちょうど 0.1 のとき、1 桁小数表記 '0.1x' を返す（境界値: ratio >= 0.1）", () => {
    expect(formatCostMultiplierLabel(1, 10)).toBe("0.1x");
  });

  it("比率が 0.1 以上 1 未満のとき、1 桁小数表記を返す", () => {
    expect(formatCostMultiplierLabel(5, 10)).toBe("0.5x");
    expect(formatCostMultiplierLabel(9, 10)).toBe("0.9x");
  });

  it("比率が 0.01 以上 0.1 未満のとき、2 桁小数表記を返す", () => {
    expect(formatCostMultiplierLabel(5, 100)).toBe("0.05x");
    expect(formatCostMultiplierLabel(2, 100)).toBe("0.02x");
  });

  it("比率がちょうど 0.01 のとき、2 桁小数表記 '0.01x' を返す（境界値: ratio >= 0.01）", () => {
    expect(formatCostMultiplierLabel(1, 100)).toBe("0.01x");
  });

  it("比率が 0.001 以上 0.01 未満のとき、2 桁小数表記を返す（0.00x に丸められうる）", () => {
    // 0.005 は toFixed(2) で "0.01" になる
    expect(formatCostMultiplierLabel(5, 1000)).toBe("0.01x");
    // 0.001 は toFixed(2) で "0.00" になる
    expect(formatCostMultiplierLabel(1, 1000)).toBe("0.00x");
  });

  it("比率が 0.001 未満のとき、'<0.01x' を返す", () => {
    expect(formatCostMultiplierLabel(1, 10_000)).toBe("<0.01x");
    expect(formatCostMultiplierLabel(1, 1_000_000)).toBe("<0.01x");
  });

  it("ラベルは必ず 'x' で終わる（サニティチェック）", () => {
    const cases = [
      formatCostMultiplierLabel(0, 10),
      formatCostMultiplierLabel(1, 10),
      formatCostMultiplierLabel(50, 10),
      formatCostMultiplierLabel(5, 100),
      formatCostMultiplierLabel(1, 1_000_000),
    ];
    for (const label of cases) {
      expect(label.endsWith("x")).toBe(true);
    }
  });
});
