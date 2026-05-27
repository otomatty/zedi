/**
 * Tests for fixed Wiki Compose model id resolution.
 * 固定 Wiki Compose モデル id 解決のテスト。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveWikiComposeModelId,
  WIKI_COMPOSE_MODEL_ID,
} from "../../../../agents/core/llm/wikiComposeModelId.js";

const mockDb = {
  select: vi.fn(),
};

function chainLimit(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveWikiComposeModelId", () => {
  it("returns the fixed id when the row is active and tier-accessible", async () => {
    mockDb.select.mockReturnValueOnce(chainLimit([{ id: WIKI_COMPOSE_MODEL_ID }]));
    const id = await resolveWikiComposeModelId("orchestrator", "free", mockDb as never);
    expect(id).toBe(WIKI_COMPOSE_MODEL_ID);
  });

  it("returns the fixed id even when no DB row matches", async () => {
    mockDb.select.mockReturnValueOnce(chainLimit([]));
    const id = await resolveWikiComposeModelId("draft", "pro", mockDb as never);
    expect(id).toBe("google:gemini-3.5-flash");
  });

  it("uses the same id for orchestrator and draft roles", async () => {
    mockDb.select.mockReturnValue(chainLimit([{ id: WIKI_COMPOSE_MODEL_ID }]));
    const orchestrator = await resolveWikiComposeModelId("orchestrator", "free", mockDb as never);
    const draft = await resolveWikiComposeModelId("draft", "free", mockDb as never);
    expect(orchestrator).toBe(draft);
  });
});
