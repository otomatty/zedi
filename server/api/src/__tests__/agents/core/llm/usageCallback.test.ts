import { describe, expect, it, vi, beforeEach } from "vitest";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { recordZediUsage, toZediMessages } from "../../../../agents/core/llm/usageCallback.js";

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
    expect(result).toEqual({ inputTokens: 100, outputTokens: 50, costUnits: 0 });
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
    expect(result).toEqual({ inputTokens: 100, outputTokens: 50, costUnits: 42 });
    expect(mockCalculateCost).toHaveBeenCalledWith({ inputTokens: 100, outputTokens: 50 }, 10, 20);
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

  it("passes zero-token usage through to recordUsage unchanged", async () => {
    mockCalculateCost.mockReturnValue(0);
    const db = {} as never;
    const result = await recordZediUsage({
      db,
      userId: "u1",
      modelId: "openai:gpt-4o-mini",
      feature: "wiki_compose:test",
      usage: { inputTokens: 0, outputTokens: 0 },
      inputCostUnits: 10,
      outputCostUnits: 20,
      apiMode: "system",
    });
    expect(result).toEqual({ inputTokens: 0, outputTokens: 0, costUnits: 0 });
    expect(mockRecordUsage).toHaveBeenCalledWith(
      "u1",
      "openai:gpt-4o-mini",
      "wiki_compose:test",
      { inputTokens: 0, outputTokens: 0 },
      0,
      "system",
      db,
    );
  });
});

describe("toZediMessages", () => {
  it("maps system, assistant, and user roles from LangChain message types", () => {
    const converted = toZediMessages([
      new SystemMessage("sys"),
      new AIMessage("assistant"),
      new HumanMessage("human"),
    ]);
    expect(converted).toEqual([
      { role: "system", content: "sys" },
      { role: "assistant", content: "assistant" },
      { role: "user", content: "human" },
    ]);
  });

  it("concatenates text blocks from multi-part content arrays", () => {
    const converted = toZediMessages([
      new HumanMessage([
        { type: "text", text: "hello " },
        { type: "text", text: "world" },
      ]),
    ]);
    expect(converted).toEqual([{ role: "user", content: "hello world" }]);
  });

  it("returns empty string for unsupported content shapes", () => {
    const converted = toZediMessages([new HumanMessage([{ type: "image_url", url: "x" }])]);
    expect(converted).toEqual([{ role: "user", content: "" }]);
  });
});
