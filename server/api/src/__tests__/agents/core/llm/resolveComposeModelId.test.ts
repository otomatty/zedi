/**
 * Tests for BYOK-aware compose model id resolution (#951).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveComposeModelId } from "../../../../agents/core/llm/resolveComposeModelId.js";

const mockDb = {
  select: vi.fn(),
};

function chainLimit(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WIKI_COMPOSE_ORCHESTRATOR_MODEL_ID;
  delete process.env.WIKI_COMPOSE_DRAFT_MODEL_ID;
});

afterEach(() => {
  delete process.env.WIKI_COMPOSE_ORCHESTRATOR_MODEL_ID;
  delete process.env.WIKI_COMPOSE_DRAFT_MODEL_ID;
});

describe("resolveComposeModelId", () => {
  it("returns cheapest active OpenAI model for user_openai backend", async () => {
    mockDb.select.mockReturnValueOnce(chainLimit([{ id: "openai:gpt-4o-mini" }]));
    const id = await resolveComposeModelId("orchestrator", "user_openai", "free", mockDb as never);
    expect(id).toBe("openai:gpt-4o-mini");
  });

  it("ignores env override when provider mismatches BYOK backend", async () => {
    process.env.WIKI_COMPOSE_ORCHESTRATOR_MODEL_ID = "claude-3-5-haiku";
    mockDb.select
      .mockReturnValueOnce(chainLimit([{ id: "claude-3-5-haiku", provider: "anthropic" }]))
      .mockReturnValueOnce(chainLimit([{ id: "openai:gpt-4o-mini" }]));
    const id = await resolveComposeModelId("orchestrator", "user_openai", "free", mockDb as never);
    expect(id).toBe("openai:gpt-4o-mini");
  });

  it("keeps zedi_managed default when no DB row matches", async () => {
    mockDb.select.mockReturnValueOnce(chainLimit([]));
    const id = await resolveComposeModelId("orchestrator", "zedi_managed", "free", mockDb as never);
    expect(id).toBe("claude-3-5-haiku");
  });
});
