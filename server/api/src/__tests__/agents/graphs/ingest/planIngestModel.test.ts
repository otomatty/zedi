/**
 * `plan_ingest` must resolve models through BYOK-aware `resolveComposeModelId`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

const mockResolveComposeModelId = vi.fn();
const mockCreateZediChatModel = vi.fn();

vi.mock("../../../../agents/core/llm/resolveComposeModelId.js", () => ({
  resolveComposeModelId: (...args: unknown[]) => mockResolveComposeModelId(...args),
}));

vi.mock("../../../../agents/core/llm/modelFactory.js", () => ({
  createZediChatModel: (...args: unknown[]) => mockCreateZediChatModel(...args),
}));

vi.mock("../../../../services/ingestPlanner.js", () => ({
  buildIngestPlannerPrompt: () => [{ role: "user" as const, content: "plan me" }],
  parseIngestPlanValue: () => ({
    action: "skip" as const,
    reason: "test",
  }),
}));

import { planIngest } from "../../../../agents/graphs/ingest/nodes/planIngest.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../../../../agents/core/types/graphContext.js";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";

describe("planIngest model resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveComposeModelId.mockResolvedValue("openai:gpt-4o-mini");
    mockCreateZediChatModel.mockResolvedValue({
      withStructuredOutput: () => ({
        invoke: async () => ({
          action: "skip",
          reason: "ok",
        }),
      }),
    });
  });

  it("uses resolveComposeModelId for user_openai backend", async () => {
    const ctx: GraphContext = {
      threadId: "t1",
      sessionId: "t1",
      userId: "user-1",
      userEmail: null,
      contentLocale: "ja",
      pageId: "",
      graphId: "ingest-planner",
      backend: "user_openai",
      tier: "free",
      db: {} as Database,
      feature: "ingest_graph:test",
    };
    const config = {
      configurable: { [GRAPH_CONTEXT_CONFIG_KEY]: ctx },
    } as LangGraphRunnableConfig;

    await planIngest(
      {
        article: { title: "T", url: "https://example.com", excerpt: "e" },
        candidates: [],
        approvedResearch: [],
        rejectedResearch: [],
        pendingSources: [],
        batches: [],
        phase: "ingest:prepare",
        pageId: "",
        userId: "user-1",
        userSchema: null,
        maxIterations: 3,
        iteration: 0,
        queries: [],
        lastEvaluation: null,
        exitReason: null,
        additionalRequest: null,
        ingestPlan: null,
        messages: [],
      },
      config,
    );

    expect(mockResolveComposeModelId).toHaveBeenCalledWith(
      "orchestrator",
      "user_openai",
      "free",
      ctx.db,
    );
    expect(mockCreateZediChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "openai:gpt-4o-mini",
        backend: "user_openai",
      }),
    );
  });
});
