/**
 * sseMapper のテスト。LangGraph 風イベントから `SseEvent` への変換を確認する。
 *
 * Pure-function tests for {@link mapLangGraphEvent} and the small builder
 * helpers. The mapper is the sole place that translates LangGraph's runtime
 * event shape into wire SSE; pinning it here keeps the wire contract stable.
 */
import { describe, expect, it } from "vitest";
import {
  doneEvent,
  errorEvent,
  mapLangGraphEvent,
  startedEvent,
  statusEvent,
  usageEvent,
  type LangGraphRuntimeEvent,
} from "../../../agents/runner/sseMapper.js";

describe("startedEvent / statusEvent / usageEvent / doneEvent / errorEvent", () => {
  it("startedEvent omits phase when not provided", () => {
    expect(startedEvent("s1", "g1")).toEqual({
      type: "started",
      sessionId: "s1",
      graphId: "g1",
    });
  });

  it("startedEvent includes phase when provided", () => {
    expect(startedEvent("s1", "g1", "init")).toEqual({
      type: "started",
      sessionId: "s1",
      graphId: "g1",
      phase: "init",
    });
  });

  it("statusEvent passes through message", () => {
    expect(statusEvent("draft", "writing")).toEqual({
      type: "status",
      phase: "draft",
      message: "writing",
    });
  });

  it("usageEvent forwards all numeric fields", () => {
    expect(usageEvent({ inputTokens: 1, outputTokens: 2, costUnits: 3, usagePercent: 4 })).toEqual({
      type: "usage",
      inputTokens: 1,
      outputTokens: 2,
      costUnits: 3,
      usagePercent: 4,
    });
  });

  it("doneEvent forwards status", () => {
    expect(doneEvent("interrupted")).toEqual({ type: "done", status: "interrupted" });
  });

  it("errorEvent forwards retryable flag", () => {
    expect(errorEvent("boom", true)).toEqual({
      type: "error",
      message: "boom",
      retryable: true,
    });
  });
});

describe("mapLangGraphEvent", () => {
  it("maps on_chat_model_stream to a token event with node name", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_chat_model_stream",
      data: { chunk: { content: "Hello" } },
      metadata: { langgraph_node: "draft" },
    };
    expect(mapLangGraphEvent(ev)).toEqual([{ type: "token", node: "draft", content: "Hello" }]);
  });

  it("drops empty chat model stream chunks", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_chat_model_stream",
      data: { chunk: { content: "" } },
    };
    expect(mapLangGraphEvent(ev)).toEqual([]);
  });

  it("maps on_tool_start to a tool_start event", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_tool_start",
      name: "web_search",
      data: { input: { query: "ripgrep" } },
    };
    expect(mapLangGraphEvent(ev)).toEqual([
      { type: "tool_start", tool: "web_search", input: { query: "ripgrep" } },
    ]);
  });

  it("maps on_tool_end with output length", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_tool_end",
      name: "web_search",
      data: { output: "result text" },
    };
    expect(mapLangGraphEvent(ev)).toEqual([
      { type: "tool_end", tool: "web_search", outputLength: "result text".length },
    ]);
  });

  it("maps on_tool_end with error string", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_tool_end",
      name: "fetch_article",
      data: { error: "blocked" },
    };
    expect(mapLangGraphEvent(ev)).toEqual([
      { type: "tool_end", tool: "fetch_article", error: "blocked" },
    ]);
  });

  it("maps on_chain_end with phase to a status event", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_chain_end",
      data: { output: { phase: "completed" } },
    };
    expect(mapLangGraphEvent(ev)).toEqual([{ type: "status", phase: "completed" }]);
  });

  it("returns an empty array for unrecognised events", () => {
    expect(mapLangGraphEvent({ event: "on_unknown_event" })).toEqual([]);
  });

  it("maps on_custom_event compose_phase to a typed compose_phase event", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_custom_event",
      name: "compose_phase",
      data: { phase: "structure", status: "entered" },
    };
    expect(mapLangGraphEvent(ev)).toEqual([
      { type: "compose_phase", phase: "structure", status: "entered" },
    ]);
  });

  it("drops compose_phase with an unknown phase value", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_custom_event",
      name: "compose_phase",
      data: { phase: "bogus", status: "entered" },
    };
    expect(mapLangGraphEvent(ev)).toEqual([]);
  });

  it("maps on_custom_event compose_section to a typed compose_section event", () => {
    const ev: LangGraphRuntimeEvent = {
      event: "on_custom_event",
      name: "compose_section",
      data: {
        sectionId: "sec-1",
        heading: "Overview",
        status: "started",
        index: 1,
        total: 3,
      },
    };
    expect(mapLangGraphEvent(ev)).toEqual([
      {
        type: "compose_section",
        sectionId: "sec-1",
        heading: "Overview",
        status: "started",
        index: 1,
        total: 3,
      },
    ]);
  });
});
