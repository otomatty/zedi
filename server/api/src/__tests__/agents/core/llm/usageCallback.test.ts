import { describe, expect, it, vi, beforeEach } from "vitest";
import { recordZediUsage } from "../../../../agents/core/llm/usageCallback.js";

const mockRecordUsage = vi.fn();
const mockCalculateCost = vi.fn();

vi.mock("../../../../services/usageService.js", () => ({
  calculateCost: (...args: unknown[]) => mockCalculateCost(...args),
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}));

describe("recordZediUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateCost.mockReturnValue(42);
  });

  it("records zero costUnits for user_key (BYOK audit only)", async () => {
    const db = {} as never;
    const result = await recordZediUsage({
      db,
      userId: "u1",
      modelId: "openai:gpt-4o-mini",
      feature: "wiki_compose:test",
      usage: { inputTokens: 100, outputTokens: 50 },
      inputCostUnits: 10,
      outputCostUnits: 20,
      apiMode: "user_key",
    });
    expect(result.costUnits).toBe(0);
    expect(mockRecordUsage).toHaveBeenCalledWith(
      "u1",
      "openai:gpt-4o-mini",
      "wiki_compose:test",
      { inputTokens: 100, outputTokens: 50 },
      0,
      "user_key",
      db,
    );
  });

  it("records calculated costUnits for system mode", async () => {
    const db = {} as never;
    const result = await recordZediUsage({
      db,
      userId: "u1",
      modelId: "openai:gpt-4o-mini",
      feature: "wiki_compose:test",
      usage: { inputTokens: 100, outputTokens: 50 },
      inputCostUnits: 10,
      outputCostUnits: 20,
      apiMode: "system",
    });
    expect(result.costUnits).toBe(42);
    expect(mockRecordUsage).toHaveBeenCalledWith(
      "u1",
      "openai:gpt-4o-mini",
      "wiki_compose:test",
      { inputTokens: 100, outputTokens: 50 },
      42,
      "system",
      db,
    );
  });
});
