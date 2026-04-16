/**
 * Tests for the ingest planner service (otomatty/zedi#595).
 * Ingest プランナー（P1, LLM Wiki ingest）のユニットテスト。
 */
import { describe, it, expect } from "vitest";
import {
  buildIngestPlannerPrompt,
  createIngestLlmDriver,
  extractJsonFromResponse,
  IngestPlanParseError,
  parseIngestPlanResponse,
  planIngest,
  type CallProviderAdapter,
  type CandidatePage,
  type IngestArticleSummary,
} from "../../services/ingestPlanner.js";

const sampleArticle: IngestArticleSummary = {
  title: "Ripgrep: 高速な検索ツール",
  url: "https://example.com/rg",
  excerpt: "ripgrep は ag / ack の後継となる高速検索ツール。",
};

const sampleCandidates: CandidatePage[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    title: "ripgrep",
    excerpt: "ripgrep は Rust 製の検索ツール。",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    title: "grep",
    excerpt: "Unix の伝統的なテキスト検索ツール。",
  },
];

const candidate0Id = "11111111-1111-1111-1111-111111111111";

describe("extractJsonFromResponse", () => {
  it("returns the original string when no fence is present", () => {
    expect(extractJsonFromResponse(`{"a":1}`)).toBe(`{"a":1}`);
  });

  it("strips ```json fences", () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJsonFromResponse(raw)).toBe(`{"a":1}`);
  });

  it("strips plain ``` fences", () => {
    const raw = '```\n{"a":1}\n```';
    expect(extractJsonFromResponse(raw)).toBe(`{"a":1}`);
  });

  it("falls back to first { .. last } when there is surrounding prose", () => {
    const raw = `Here is the plan:\n{"a":1, "b":2}\nThanks!`;
    expect(extractJsonFromResponse(raw)).toBe(`{"a":1, "b":2}`);
  });
});

describe("parseIngestPlanResponse", () => {
  const validIds = new Set(sampleCandidates.map((c) => c.id));

  it("parses a valid merge plan with conflicts", () => {
    const raw = JSON.stringify({
      action: "merge",
      reason: "既存 ripgrep ページを拡張する",
      targetPageId: candidate0Id,
      summary: "ripgrep の新しい利用例を追記",
      conflicts: [
        { claim: "Rust 製", existing: "Go 製", note: "言語記述の齟齬" },
        { claim: "", existing: "invalid", note: "should be dropped" },
      ],
    });
    const plan = parseIngestPlanResponse(raw, { validCandidateIds: validIds });
    expect(plan.action).toBe("merge");
    expect(plan.targetPageId).toBe(candidate0Id);
    expect(plan.summary).toBe("ripgrep の新しい利用例を追記");
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts?.[0]?.note).toBe("言語記述の齟齬");
  });

  it("parses a valid create plan", () => {
    const raw = JSON.stringify({
      action: "create",
      reason: "候補に一致するページがない",
      title: "fd-find",
    });
    const plan = parseIngestPlanResponse(raw, { validCandidateIds: validIds });
    expect(plan.action).toBe("create");
    expect(plan.title).toBe("fd-find");
    expect(plan.targetPageId).toBeUndefined();
  });

  it("parses a valid skip plan", () => {
    const raw = JSON.stringify({
      action: "skip",
      reason: "新規情報なし",
    });
    const plan = parseIngestPlanResponse(raw);
    expect(plan.action).toBe("skip");
    expect(plan.reason).toBe("新規情報なし");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseIngestPlanResponse(`not json`)).toThrow(IngestPlanParseError);
  });

  it("throws on non-object payload", () => {
    expect(() => parseIngestPlanResponse(`[1,2,3]`)).toThrow(IngestPlanParseError);
  });

  it("throws on unknown action", () => {
    const raw = JSON.stringify({ action: "purge", reason: "x" });
    expect(() => parseIngestPlanResponse(raw)).toThrow(/Invalid action/);
  });

  it("throws when reason is missing or empty", () => {
    const raw = JSON.stringify({ action: "skip", reason: "   " });
    expect(() => parseIngestPlanResponse(raw)).toThrow(/"reason" is required/);
  });

  it("throws when merge has no targetPageId", () => {
    const raw = JSON.stringify({ action: "merge", reason: "merge" });
    expect(() => parseIngestPlanResponse(raw, { validCandidateIds: validIds })).toThrow(
      /"targetPageId" is required/,
    );
  });

  it("throws when targetPageId is not in the candidate set (hallucination guard)", () => {
    const raw = JSON.stringify({
      action: "merge",
      reason: "merge",
      targetPageId: "99999999-9999-9999-9999-999999999999",
    });
    expect(() => parseIngestPlanResponse(raw, { validCandidateIds: validIds })).toThrow(
      /hallucinated/,
    );
  });

  it("accepts targetPageId when no validCandidateIds set is provided (no guard)", () => {
    const raw = JSON.stringify({
      action: "merge",
      reason: "merge",
      targetPageId: "free-form-id",
    });
    const plan = parseIngestPlanResponse(raw);
    expect(plan.targetPageId).toBe("free-form-id");
  });

  it("throws when create has no title", () => {
    const raw = JSON.stringify({ action: "create", reason: "create" });
    expect(() => parseIngestPlanResponse(raw)).toThrow(/"title" is required/);
  });

  it("tolerates extra unknown fields", () => {
    const raw = JSON.stringify({
      action: "skip",
      reason: "noise",
      irrelevant: { foo: "bar" },
    });
    const plan = parseIngestPlanResponse(raw);
    expect(plan.action).toBe("skip");
  });

  it("drops conflicts when not an array", () => {
    const raw = JSON.stringify({
      action: "skip",
      reason: "noise",
      conflicts: "nope",
    });
    const plan = parseIngestPlanResponse(raw);
    expect(plan.conflicts).toBeUndefined();
  });

  it("strips fenced JSON responses", () => {
    const raw = '```json\n{"action":"skip","reason":"ok"}\n```';
    const plan = parseIngestPlanResponse(raw);
    expect(plan.action).toBe("skip");
  });
});

describe("buildIngestPlannerPrompt", () => {
  it("includes article title, url, and candidates", () => {
    const messages = buildIngestPlannerPrompt({
      article: sampleArticle,
      candidates: sampleCandidates,
    });
    const [systemMsg, userMsg] = messages;
    expect(messages).toHaveLength(2);
    expect(systemMsg?.role).toBe("system");
    expect(userMsg?.role).toBe("user");
    expect(userMsg?.content).toContain(sampleArticle.title);
    expect(userMsg?.content).toContain(sampleArticle.url);
    expect(userMsg?.content).toContain(candidate0Id);
    expect(userMsg?.content).toContain("22222222-2222-2222-2222-222222222222");
  });

  it("renders '(no candidates)' when candidates is empty", () => {
    const messages = buildIngestPlannerPrompt({
      article: sampleArticle,
      candidates: [],
    });
    expect(messages[1]?.content).toContain("(no candidates)");
  });

  it("includes userSchema block when provided and non-empty", () => {
    const messages = buildIngestPlannerPrompt({
      article: sampleArticle,
      candidates: sampleCandidates,
      userSchema: "Cite sources at the end of each paragraph.",
    });
    expect(messages[0]?.content).toContain("User-defined wiki schema");
    expect(messages[0]?.content).toContain("Cite sources at the end of each paragraph.");
  });

  it("omits userSchema block when string is whitespace", () => {
    const messages = buildIngestPlannerPrompt({
      article: sampleArticle,
      candidates: sampleCandidates,
      userSchema: "   \n   ",
    });
    expect(messages[0]?.content).not.toContain("User-defined wiki schema");
  });

  it("truncates very long excerpts to avoid prompt blow-up", () => {
    const hugeExcerpt = "A".repeat(10_000);
    const messages = buildIngestPlannerPrompt({
      article: { ...sampleArticle, excerpt: hugeExcerpt },
      candidates: [],
    });
    const userMsg = messages[1];
    expect(userMsg?.content).toContain("…");
    expect(userMsg?.content.length ?? 0).toBeLessThan(hugeExcerpt.length);
  });
});

describe("planIngest (orchestration)", () => {
  it("calls the LLM driver with the built prompt and parses the response", async () => {
    const fakeResponse = JSON.stringify({
      action: "merge",
      reason: "既存 ripgrep を拡張",
      targetPageId: candidate0Id,
    });
    const plan = await planIngest({
      article: sampleArticle,
      candidates: sampleCandidates,
      llm: async (messages) => {
        // The orchestrator passes through to buildIngestPlannerPrompt
        expect(messages[0]?.role).toBe("system");
        expect(messages[1]?.content).toContain(sampleArticle.title);
        return fakeResponse;
      },
    });
    expect(plan.action).toBe("merge");
    expect(plan.targetPageId).toBe(candidate0Id);
  });

  it("propagates parse errors as IngestPlanParseError", async () => {
    await expect(
      planIngest({
        article: sampleArticle,
        candidates: sampleCandidates,
        llm: async () => "not json at all",
      }),
    ).rejects.toBeInstanceOf(IngestPlanParseError);
  });

  it("guards against hallucinated targetPageId via the candidate set", async () => {
    await expect(
      planIngest({
        article: sampleArticle,
        candidates: sampleCandidates,
        llm: async () =>
          JSON.stringify({
            action: "merge",
            reason: "x",
            targetPageId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          }),
      }),
    ).rejects.toThrow(/hallucinated/);
  });
});

describe("createIngestLlmDriver", () => {
  it("wraps a callProvider-compatible adapter into a driver", async () => {
    let capturedProvider = "";
    let capturedModel = "";
    let capturedKey = "";
    const adapter: CallProviderAdapter = async (provider, apiKey, model, _messages) => {
      capturedProvider = provider;
      capturedModel = model;
      capturedKey = apiKey;
      return { content: `[${provider}] ok` };
    };
    const driver = createIngestLlmDriver(adapter, {
      provider: "openai",
      model: "gpt-x",
      apiKey: "sk-TEST",
    });
    const out = await driver([{ role: "user", content: "hi" }]);
    expect(out).toBe("[openai] ok");
    expect(capturedProvider).toBe("openai");
    expect(capturedModel).toBe("gpt-x");
    expect(capturedKey).toBe("sk-TEST");
  });
});
