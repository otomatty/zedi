import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, TEST_USER_ID, type MockDb } from "../helpers/setup";
import {
  checkUsage,
  validateModelAccess,
  calculateCost,
  recordUsage,
} from "../../services/usageService";

let mockDb: MockDb;

beforeEach(() => {
  mockDb = createMockDb();
});

describe("usageService", () => {
  describe("checkUsage", () => {
    it("returns allowed=true when within budget", async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ monthlyBudgetUnits: 10000 }])
        .mockResolvedValueOnce([{ totalCostUnits: 5000 }]);

      const result = await checkUsage(TEST_USER_ID, "free", mockDb as unknown);

      expect(result.allowed).toBe(true);
      expect(result.budgetUnits).toBe(10000);
      expect(result.consumedUnits).toBe(5000);
      expect(result.remaining).toBe(5000);
      expect(result.tier).toBe("free");
    });

    it("returns allowed=false when over budget", async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ monthlyBudgetUnits: 10000 }])
        .mockResolvedValueOnce([{ totalCostUnits: 15000 }]);

      const result = await checkUsage(TEST_USER_ID, "free", mockDb as unknown);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.consumedUnits).toBe(15000);
    });

    it("uses default budget when no tier budget found", async () => {
      mockDb.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ totalCostUnits: 0 }]);

      const freeResult = await checkUsage(TEST_USER_ID, "free", mockDb as unknown);
      expect(freeResult.budgetUnits).toBe(10000);

      mockDb.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ totalCostUnits: 0 }]);

      const proResult = await checkUsage(TEST_USER_ID, "pro", mockDb as unknown);
      expect(proResult.budgetUnits).toBe(100000);
    });
  });

  describe("validateModelAccess", () => {
    it("returns model info for valid model", async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          provider: "openai",
          modelId: "gpt-4o",
          inputCostUnits: 5,
          outputCostUnits: 15,
          tierRequired: "free",
          isActive: true,
        },
      ]);

      const result = await validateModelAccess("model-1", "free", mockDb as unknown);

      expect(result).toEqual({
        provider: "openai",
        apiModelId: "gpt-4o",
        inputCostUnits: 5,
        outputCostUnits: 15,
      });
    });

    it("throws for invalid or inactive model", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(validateModelAccess("nonexistent", "free", mockDb as unknown)).rejects.toThrow(
        "Model not found or inactive",
      );
    });

    it("throws FORBIDDEN when free user accesses pro model", async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          provider: "anthropic",
          modelId: "claude-opus",
          inputCostUnits: 10,
          outputCostUnits: 30,
          tierRequired: "pro",
          isActive: true,
        },
      ]);

      await expect(validateModelAccess("model-pro", "free", mockDb as unknown)).rejects.toThrow(
        "FORBIDDEN",
      );
    });
  });

  describe("calculateCost", () => {
    it("correctly computes cost units", () => {
      const cost = calculateCost({ inputTokens: 1000, outputTokens: 500 }, 5, 15);
      // (1000/1000)*5 + (500/1000)*15 = 5 + 7.5 = 12.5 → ceil → 13
      expect(cost).toBe(13);
    });

    it("rounds up with Math.ceil", () => {
      const cost = calculateCost({ inputTokens: 1, outputTokens: 1 }, 1, 1);
      // (1/1000)*1 + (1/1000)*1 = 0.002 → ceil → 1
      expect(cost).toBe(1);
    });
  });

  describe("recordUsage", () => {
    it("inserts usage log and upserts monthly usage", async () => {
      mockDb.then.mockImplementationOnce((r?: ((v: unknown) => unknown) | null) =>
        Promise.resolve(undefined).then(r),
      );

      await recordUsage(
        TEST_USER_ID,
        "model-1",
        "chat",
        { inputTokens: 100, outputTokens: 50 },
        10,
        "system",
        mockDb as unknown,
      );

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(mockDb.values).toHaveBeenCalledTimes(2);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
