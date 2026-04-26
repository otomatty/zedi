/**
 * usageService.ts のテスト（checkUsage / validateModelAccess / calculateCost / recordUsage）。
 * Tests for usageService.
 */
import { describe, it, expect } from "vitest";
import {
  checkUsage,
  validateModelAccess,
  calculateCost,
  recordUsage,
} from "../../services/usageService.js";
import { createMockDb } from "../createMockDb.js";
import type { Database } from "../../types/index.js";

function asDb(results: unknown[]) {
  const { db, chains } = createMockDb(results);
  return { db: db as unknown as Database, chains };
}

// ── calculateCost ───────────────────────────────────────────────────────────

describe("calculateCost", () => {
  it("rounds up combined input + output cost", () => {
    // (1000 / 1000) * 5 + (500 / 1000) * 15 = 5 + 7.5 = 12.5 → ceil → 13
    expect(calculateCost({ inputTokens: 1000, outputTokens: 500 }, 5, 15)).toBe(13);
  });

  it("returns 0 when usage is zero", () => {
    expect(calculateCost({ inputTokens: 0, outputTokens: 0 }, 10, 20)).toBe(0);
  });

  it("treats sub-1k token usage proportionally and rounds up", () => {
    // (100 / 1000) * 10 + (0 / 1000) * 20 = 1 → ceil → 1
    expect(calculateCost({ inputTokens: 100, outputTokens: 0 }, 10, 20)).toBe(1);
  });
});

// ── checkUsage ──────────────────────────────────────────────────────────────

describe("checkUsage", () => {
  it("returns budget/consumed/usagePercent when both rows exist", async () => {
    // 1) tier budget row, 2) monthly usage row
    const { db } = asDb([[{ monthlyBudgetUnits: 10000 }], [{ totalCostUnits: 2500 }]]);

    const result = await checkUsage("u1", "pro", db);

    expect(result).toMatchObject({
      allowed: true,
      budgetUnits: 10000,
      consumedUnits: 2500,
      remaining: 7500,
      tier: "pro",
    });
    expect(result.usagePercent).toBeCloseTo(25);
  });

  it("falls back to default budget (15000 for pro) when no budget row exists", async () => {
    const { db } = asDb([[], []]);

    const result = await checkUsage("u1", "pro", db);

    expect(result.budgetUnits).toBe(15000);
    expect(result.consumedUnits).toBe(0);
    expect(result.allowed).toBe(true);
  });

  it("falls back to 1500 for the free tier", async () => {
    const { db } = asDb([[], []]);

    const result = await checkUsage("u1", "free", db);

    expect(result.budgetUnits).toBe(1500);
    expect(result.tier).toBe("free");
  });

  it("returns allowed=false when consumed >= budget", async () => {
    const { db } = asDb([[{ monthlyBudgetUnits: 1000 }], [{ totalCostUnits: 1000 }]]);

    const result = await checkUsage("u1", "pro", db);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.usagePercent).toBeCloseTo(100);
  });

  it("clamps remaining to 0 when consumed > budget", async () => {
    const { db } = asDb([[{ monthlyBudgetUnits: 1000 }], [{ totalCostUnits: 1500 }]]);

    const result = await checkUsage("u1", "pro", db);

    expect(result.remaining).toBe(0);
    expect(result.allowed).toBe(false);
  });

  it("returns 0 usagePercent when budget is 0", async () => {
    const { db } = asDb([[{ monthlyBudgetUnits: 0 }], [{ totalCostUnits: 0 }]]);

    const result = await checkUsage("u1", "pro", db);

    expect(result.usagePercent).toBe(0);
  });
});

// ── validateModelAccess ─────────────────────────────────────────────────────

describe("validateModelAccess", () => {
  it("returns model info when model is active and tier matches", async () => {
    const { db } = asDb([
      [
        {
          provider: "openai",
          modelId: "gpt-4o",
          inputCostUnits: 5,
          outputCostUnits: 15,
          tierRequired: "free",
          isActive: true,
        },
      ],
    ]);

    const info = await validateModelAccess("model-1", "free", db);

    expect(info).toEqual({
      provider: "openai",
      apiModelId: "gpt-4o",
      inputCostUnits: 5,
      outputCostUnits: 15,
    });
  });

  it("throws 'Model not found or inactive' when no row matches", async () => {
    const { db } = asDb([[]]);

    await expect(validateModelAccess("missing", "pro", db)).rejects.toThrow(
      /not found or inactive/i,
    );
  });

  it("throws 'FORBIDDEN' when model requires pro and tier is free", async () => {
    const { db } = asDb([
      [
        {
          provider: "openai",
          modelId: "gpt-4-pro",
          inputCostUnits: 10,
          outputCostUnits: 30,
          tierRequired: "pro",
          isActive: true,
        },
      ],
    ]);

    await expect(validateModelAccess("model-pro", "free", db)).rejects.toThrow("FORBIDDEN");
  });

  it("allows pro tier on a pro-required model", async () => {
    const { db } = asDb([
      [
        {
          provider: "anthropic",
          modelId: "claude-opus",
          inputCostUnits: 20,
          outputCostUnits: 60,
          tierRequired: "pro",
          isActive: true,
        },
      ],
    ]);

    const info = await validateModelAccess("model-pro", "pro", db);
    expect(info.apiModelId).toBe("claude-opus");
  });
});

// ── recordUsage ─────────────────────────────────────────────────────────────

describe("recordUsage", () => {
  it("issues an insert into aiUsageLogs and an upsert into aiMonthlyUsage", async () => {
    // 1) insert aiUsageLogs, 2) upsert aiMonthlyUsage
    const { db, chains } = asDb([undefined, undefined]);

    await recordUsage(
      "user-1",
      "model-1",
      "chat",
      { inputTokens: 200, outputTokens: 100 },
      7,
      "system",
      db,
    );

    // 2 つの DB チェーンが消費される。
    // recordUsage starts exactly two top-level chains (insert + upsert).
    expect(chains.length).toBe(2);
    expect(chains[0]?.startMethod).toBe("insert");
    expect(chains[1]?.startMethod).toBe("insert");

    // 1 件目: values() に渡された生データ。
    // First chain: values() argument carries the log fields.
    const valuesCall = chains[0]?.ops.find((op) => op.method === "values");
    expect(valuesCall?.args[0]).toMatchObject({
      userId: "user-1",
      modelId: "model-1",
      feature: "chat",
      inputTokens: 200,
      outputTokens: 100,
      costUnits: 7,
      apiMode: "system",
    });
  });
});
