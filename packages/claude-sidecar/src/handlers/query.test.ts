/**
 * query.ts のユニットテスト
 *
 * - 7 つのストリーム抽出ヘルパ (extract*, is*, emitResultOrError) を表駆動で検証する
 * - `runQuery` は SDK の `query` をモック化し、stream → SidecarResponse の写像を
 *   end-to-end で検証する。SDK 自体は触らない。
 *
 * Unit tests for the stream-event helpers and the `runQuery` orchestrator. The Claude
 * Agent SDK is mocked so this suite is hermetic and runs without network access.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKToolProgressMessage,
} from "@anthropic-ai/claude-agent-sdk";

// `runQuery` 内部で SDK の `query()` を呼ぶ箇所をモック化する。
// Mock the SDK `query()` so runQuery's orchestration is exercised without real network calls.
const queryMock = vi.fn();

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import {
  extractAssistantText,
  extractTextDelta,
  extractToolUseStart,
  emitResultOrError,
  isContentBlockStop,
  isResultMessage,
  isSystemInitMessage,
  isToolProgressMessage,
  runQuery,
} from "./query";
import { QueryActivityTracker } from "./status";
import type { SidecarResponse } from "../protocol";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Build a `stream_event` partial-assistant message wrapping a raw event. / 任意イベントをラップした partial 用テストヘルパ */
function partial(event: unknown): SDKPartialAssistantMessage {
  return {
    type: "stream_event",
    event,
    parent_tool_use_id: null,
    uuid: "uuid-partial",
    session_id: "sess-1",
  } as unknown as SDKPartialAssistantMessage;
}

/** Build an SDKAssistantMessage with the given content blocks. / 指定 content の assistant メッセージを作る */
function assistant(content: unknown[]): SDKAssistantMessage {
  return {
    type: "assistant",
    message: { content } as unknown,
    parent_tool_use_id: null,
    uuid: "uuid-assistant",
    session_id: "sess-1",
  } as unknown as SDKAssistantMessage;
}

/** Build a `tool_progress` message. / `tool_progress` テストヘルパ */
function toolProgress(toolName: string): SDKToolProgressMessage {
  return {
    type: "tool_progress",
    tool_use_id: "tool-1",
    tool_name: toolName,
    parent_tool_use_id: null,
    elapsed_time_seconds: 0.1,
    uuid: "uuid-tool",
    session_id: "sess-1",
  } as unknown as SDKToolProgressMessage;
}

/** Build a successful `result` message. / 成功 result */
function resultSuccess(text: string): SDKResultMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 1,
    duration_api_ms: 1,
    is_error: false,
    num_turns: 1,
    result: text,
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {} as never,
    modelUsage: {},
    permission_denials: [],
    uuid: "uuid-result",
    session_id: "sess-1",
  } as unknown as SDKResultMessage;
}

/** Build an error `result` message with an explicit `errors` array. / エラー result */
function resultError(
  subtype: "error_during_execution" | "error_max_turns",
  errors: string[],
): SDKResultMessage {
  return {
    type: "result",
    subtype,
    duration_ms: 1,
    duration_api_ms: 1,
    is_error: true,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0,
    usage: {} as never,
    modelUsage: {},
    permission_denials: [],
    errors,
    uuid: "uuid-result",
    session_id: "sess-1",
  } as unknown as SDKResultMessage;
}

/** Wraps an array of SDKMessage into the async-iterable shape `runQuery` expects. / 配列を async-iterable 化する */
function makeQueryIterable(messages: SDKMessage[]): {
  [Symbol.asyncIterator](): AsyncIterator<SDKMessage>;
} {
  return {
    async *[Symbol.asyncIterator]() {
      for (const m of messages) yield m;
    },
  };
}

// ── helper tests ────────────────────────────────────────────────────────────

describe("extractTextDelta", () => {
  it("returns the text on a content_block_delta with text_delta", () => {
    const msg = partial({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "hello" },
    });
    expect(extractTextDelta(msg)).toBe("hello");
  });

  it("returns null when event is not content_block_delta", () => {
    expect(extractTextDelta(partial({ type: "content_block_start" }))).toBeNull();
  });

  it("returns null when delta is not a text_delta", () => {
    const msg = partial({
      type: "content_block_delta",
      delta: { type: "input_json_delta", partial_json: "{}" },
    });
    expect(extractTextDelta(msg)).toBeNull();
  });

  it("returns null when event is missing", () => {
    expect(extractTextDelta(partial(undefined))).toBeNull();
  });

  it("returns null when text is not a string", () => {
    const msg = partial({
      type: "content_block_delta",
      delta: { type: "text_delta", text: 123 },
    });
    expect(extractTextDelta(msg)).toBeNull();
  });
});

describe("extractToolUseStart", () => {
  it("extracts {name, input} when input is a string", () => {
    const msg = partial({
      type: "content_block_start",
      content_block: { type: "tool_use", name: "Read", input: '{"path":"x"}' },
    });
    expect(extractToolUseStart(msg)).toEqual({ name: "Read", input: '{"path":"x"}' });
  });

  it("JSON-stringifies non-string input", () => {
    const msg = partial({
      type: "content_block_start",
      content_block: { type: "tool_use", name: "Bash", input: { command: "ls" } },
    });
    expect(extractToolUseStart(msg)).toEqual({
      name: "Bash",
      input: JSON.stringify({ command: "ls" }),
    });
  });

  it("falls back to 'unknown' when name is missing", () => {
    const msg = partial({
      type: "content_block_start",
      content_block: { type: "tool_use", input: "x" },
    });
    expect(extractToolUseStart(msg)).toEqual({ name: "unknown", input: "x" });
  });

  it("returns null when content_block is not a tool_use", () => {
    const msg = partial({
      type: "content_block_start",
      content_block: { type: "text", text: "" },
    });
    expect(extractToolUseStart(msg)).toBeNull();
  });

  it("returns null when event type is wrong", () => {
    expect(extractToolUseStart(partial({ type: "content_block_stop" }))).toBeNull();
  });
});

describe("isContentBlockStop", () => {
  it("returns true only for content_block_stop events", () => {
    expect(isContentBlockStop(partial({ type: "content_block_stop" }))).toBe(true);
    expect(isContentBlockStop(partial({ type: "content_block_delta" }))).toBe(false);
    expect(isContentBlockStop(partial(undefined))).toBe(false);
  });
});

describe("isToolProgressMessage", () => {
  it("identifies tool_progress messages", () => {
    expect(isToolProgressMessage(toolProgress("Bash"))).toBe(true);
  });

  it("rejects other message types", () => {
    expect(isToolProgressMessage(assistant([]) as unknown as SDKMessage)).toBe(false);
    expect(isToolProgressMessage(resultSuccess("ok"))).toBe(false);
  });
});

describe("extractAssistantText", () => {
  it("concatenates every text block in order", () => {
    const text = extractAssistantText(
      assistant([
        { type: "text", text: "hello " },
        { type: "tool_use", name: "Read", input: {} },
        { type: "text", text: "world" },
      ]),
    );
    expect(text).toBe("hello world");
  });

  it("returns an empty string when content is missing", () => {
    expect(extractAssistantText(assistant(undefined as unknown as unknown[]))).toBe("");
  });

  it("ignores non-text blocks", () => {
    const text = extractAssistantText(
      assistant([
        { type: "tool_use", name: "Read", input: {} },
        { type: "tool_result", content: "foo" },
      ]),
    );
    expect(text).toBe("");
  });
});

describe("isResultMessage", () => {
  it("matches success and error result subtypes", () => {
    expect(isResultMessage(resultSuccess("x"))).toBe(true);
    expect(isResultMessage(resultError("error_during_execution", []))).toBe(true);
  });

  it("rejects non-result messages", () => {
    expect(isResultMessage(toolProgress("x") as unknown as SDKMessage)).toBe(false);
  });
});

describe("isSystemInitMessage", () => {
  it("matches a system message with subtype: init", () => {
    expect(isSystemInitMessage({ type: "system", subtype: "init" } as unknown as SDKMessage)).toBe(
      true,
    );
  });

  it("rejects non-init system messages", () => {
    expect(isSystemInitMessage({ type: "system", subtype: "other" } as unknown as SDKMessage)).toBe(
      false,
    );
  });

  it("rejects messages of other types", () => {
    expect(isSystemInitMessage(resultSuccess("x"))).toBe(false);
  });
});

describe("emitResultOrError", () => {
  it("emits stream-complete with msg.result on success", () => {
    const calls: SidecarResponse[] = [];
    emitResultOrError("q1", resultSuccess("final"), "agg", (r) => calls.push(r));
    expect(calls).toEqual([{ type: "stream-complete", id: "q1", result: { content: "final" } }]);
  });

  it("falls back to aggregated text when msg.result is missing", () => {
    const calls: SidecarResponse[] = [];
    const msg = resultSuccess("");
    // Simulate the SDK returning nullish `result` (e.g. older SDK versions).
    // 古い SDK で result が null/undefined になるパスを模擬する。
    (msg as { result?: string | null }).result = null;
    emitResultOrError("q1", msg, "from-stream", (r) => calls.push(r));
    expect(calls).toEqual([
      { type: "stream-complete", id: "q1", result: { content: "from-stream" } },
    ]);
  });

  it("joins error array with '; ' on error subtypes", () => {
    const calls: SidecarResponse[] = [];
    emitResultOrError("q1", resultError("error_during_execution", ["one", "two"]), "", (r) =>
      calls.push(r),
    );
    expect(calls).toEqual([
      {
        type: "error",
        id: "q1",
        error: "one; two",
        code: "error_during_execution",
      },
    ]);
  });

  it("falls back to a generic message when errors[] is empty", () => {
    const calls: SidecarResponse[] = [];
    emitResultOrError("q1", resultError("error_max_turns", []), "", (r) => calls.push(r));
    expect(calls).toEqual([
      {
        type: "error",
        id: "q1",
        error: "Claude Code finished with subtype error_max_turns",
        code: "error_max_turns",
      },
    ]);
  });
});

// ── runQuery integration ────────────────────────────────────────────────────

describe("runQuery", () => {
  let writes: string[];
  let tracker: QueryActivityTracker;

  beforeEach(() => {
    writes = [];
    tracker = new QueryActivityTracker();
    queryMock.mockReset();
  });

  afterEach(() => {
    queryMock.mockReset();
  });

  /** Parse the JSONL writes into an array of SidecarResponse objects. / writeLine の出力を JSON にして返す */
  function parsed(): SidecarResponse[] {
    return writes.map((line) => JSON.parse(line.trim()) as SidecarResponse);
  }

  it("forwards default tools and options to the SDK and emits a stream-complete on success", async () => {
    const messages: SDKMessage[] = [
      // text delta -> stream-chunk
      partial({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hi" },
      }) as unknown as SDKMessage,
      resultSuccess("hi"),
    ];
    queryMock.mockReturnValue(makeQueryIterable(messages));

    const ac = new AbortController();
    await runQuery({
      id: "q1",
      prompt: "say hi",
      writeLine: (l) => writes.push(l),
      abortController: ac,
      tracker,
    });

    expect(queryMock).toHaveBeenCalledOnce();
    const opts = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: Record<string, unknown>;
    };
    expect(opts.prompt).toBe("say hi");
    expect(opts.options.allowedTools).toEqual(["Read", "Write", "Bash", "WebSearch"]);
    expect(opts.options.maxTurns).toBe(25);
    expect(opts.options.permissionMode).toBe("acceptEdits");
    expect(opts.options.includePartialMessages).toBe(true);
    expect(opts.options.mcpServers).toBeUndefined();

    expect(parsed()).toEqual([
      { type: "stream-chunk", id: "q1", content: "hi" },
      { type: "stream-complete", id: "q1", result: { content: "hi" } },
    ]);
    // tracker は finally で end されるので最終的に idle に戻る / tracker ends in finally → idle
    expect(tracker.snapshot().status).toBe("idle");
  });

  it("appends the mcp__* permission when mcpServers are provided", async () => {
    queryMock.mockReturnValue(makeQueryIterable([resultSuccess("done")]));

    await runQuery({
      id: "q1",
      prompt: "mcp",
      mcpServers: { z: { command: "/bin/z" } },
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    const opts = queryMock.mock.calls[0]?.[0] as { options: { allowedTools: string[] } };
    expect(opts.options.allowedTools).toEqual(["Read", "Write", "Bash", "WebSearch", "mcp__*"]);
  });

  it("respects an explicit allowedTools override", async () => {
    queryMock.mockReturnValue(makeQueryIterable([resultSuccess("done")]));

    await runQuery({
      id: "q1",
      prompt: "p",
      allowedTools: ["Bash"],
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    const opts = queryMock.mock.calls[0]?.[0] as { options: { allowedTools: string[] } };
    expect(opts.options.allowedTools).toEqual(["Bash"]);
  });

  it("emits tool-use-start and tool-use-complete around a tool block", async () => {
    queryMock.mockReturnValue(
      makeQueryIterable([
        partial({
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Read", input: '{"path":"a"}' },
        }) as unknown as SDKMessage,
        partial({ type: "content_block_stop" }) as unknown as SDKMessage,
        resultSuccess("ok"),
      ]),
    );

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "tool-use-start", id: "q1", toolName: "Read", toolInput: '{"path":"a"}' },
      { type: "tool-use-complete", id: "q1", toolName: "Read" },
      { type: "stream-complete", id: "q1", result: { content: "ok" } },
    ]);
  });

  it("aggregates text deltas before falling back to assistant slicing", async () => {
    // partial deltas が "Hello " を集約した後、assistant は "Hello world" を持つ。
    // 残りの " world" のみが新しい delta として出力されるはず。
    // After "Hello " is aggregated via deltas, the assistant message contains
    // "Hello world"; only the trailing " world" should be emitted as a new chunk.
    queryMock.mockReturnValue(
      makeQueryIterable([
        partial({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello " },
        }) as unknown as SDKMessage,
        assistant([{ type: "text", text: "Hello world" }]) as unknown as SDKMessage,
        resultSuccess("Hello world"),
      ]),
    );

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "stream-chunk", id: "q1", content: "Hello " },
      { type: "stream-chunk", id: "q1", content: "world" },
      { type: "stream-complete", id: "q1", result: { content: "Hello world" } },
    ]);
  });

  it("starts a new tool when tool_progress reports a different tool, completing the previous one", async () => {
    queryMock.mockReturnValue(
      makeQueryIterable([
        toolProgress("ToolA") as unknown as SDKMessage,
        toolProgress("ToolA") as unknown as SDKMessage,
        toolProgress("ToolB") as unknown as SDKMessage,
        resultSuccess(""),
      ]),
    );

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "tool-use-start", id: "q1", toolName: "ToolA", toolInput: "" },
      { type: "tool-use-complete", id: "q1", toolName: "ToolA" },
      { type: "tool-use-start", id: "q1", toolName: "ToolB", toolInput: "" },
      { type: "tool-use-complete", id: "q1", toolName: "ToolB" },
      { type: "stream-complete", id: "q1", result: { content: "" } },
    ]);
  });

  it("emits mcp-status when system init carries non-empty mcp_servers", async () => {
    queryMock.mockReturnValue(
      makeQueryIterable([
        {
          type: "system",
          subtype: "init",
          mcp_servers: [
            {
              name: "zedi",
              status: "connected",
              tools: [{ name: "search", description: "Find" }],
            },
            { name: "broken", status: "error", error: "boom" },
          ],
        } as unknown as SDKMessage,
        resultSuccess(""),
      ]),
    );

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    const responses = parsed();
    expect(responses[0]).toEqual({
      type: "mcp-status",
      id: "q1",
      servers: [
        {
          name: "zedi",
          status: "connected",
          error: undefined,
          tools: [{ name: "search", description: "Find" }],
        },
        { name: "broken", status: "error", error: "boom", tools: undefined },
      ],
    });
  });

  it("converts a result error into an error response", async () => {
    queryMock.mockReturnValue(
      makeQueryIterable([resultError("error_max_turns", ["limit reached"])]),
    );

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "error", id: "q1", error: "limit reached", code: "error_max_turns" },
    ]);
  });

  it("catches synchronous SDK exceptions and emits a query_exception error", async () => {
    queryMock.mockImplementation(() => {
      throw new Error("SDK exploded");
    });

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "error", id: "q1", error: "SDK exploded", code: "query_exception" },
    ]);
    expect(tracker.snapshot().status).toBe("idle");
  });

  it("emits an aborted error when the abort signal is fired before the result arrives", async () => {
    const ac = new AbortController();
    // Trigger abort before iteration begins so the loop sees it on the first message.
    // 反復開始前に abort して、最初のメッセージでループを抜けるようにする。
    ac.abort();
    queryMock.mockReturnValue(
      makeQueryIterable([
        partial({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "x" },
        }) as unknown as SDKMessage,
      ]),
    );

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: ac,
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "error", id: "q1", error: "Query aborted", code: "aborted" },
    ]);
  });

  it("flushes an active tool with tool-use-complete when aborted mid-tool", async () => {
    // Start a tool, then abort before it finishes — the consumer must still see
    // tool-use-complete so the start/complete pair stays balanced.
    // ツール開始後に中断した場合でも tool-use-complete を発火させ、開始/完了対応を保つ。
    const ac = new AbortController();
    // Custom iterable: emit tool-use-start, abort, then yield one more event that
    // the loop should detect-and-break-on rather than process.
    // tool-use-start を流した直後に abort し、次のイベントでループを抜けるイテラブル。
    queryMock.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield partial({
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Bash", input: '{"command":"sleep 1"}' },
        }) as unknown as SDKMessage;
        ac.abort();
        yield partial({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ignored" },
        }) as unknown as SDKMessage;
      },
    });

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: ac,
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "tool-use-start", id: "q1", toolName: "Bash", toolInput: '{"command":"sleep 1"}' },
      { type: "tool-use-complete", id: "q1", toolName: "Bash" },
      { type: "error", id: "q1", error: "Query aborted", code: "aborted" },
    ]);
  });

  it("flushes an active tool with tool-use-complete when the stream throws mid-tool", async () => {
    // If the SDK iterator throws while a tool is active, emit tool-use-complete before the error.
    // SDK イテレータがツール処理中に例外を投げた場合でも、エラーの前に tool-use-complete を発火させる。
    queryMock.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield partial({
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Read", input: '{"path":"/x"}' },
        }) as unknown as SDKMessage;
        throw new Error("stream blew up");
      },
    });

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "tool-use-start", id: "q1", toolName: "Read", toolInput: '{"path":"/x"}' },
      { type: "tool-use-complete", id: "q1", toolName: "Read" },
      { type: "error", id: "q1", error: "stream blew up", code: "query_exception" },
    ]);
    expect(tracker.snapshot().status).toBe("idle");
  });

  it("emits stream-complete with the aggregated text when the stream ends without a result", async () => {
    queryMock.mockReturnValue(
      makeQueryIterable([
        partial({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "partial" },
        }) as unknown as SDKMessage,
      ]),
    );

    await runQuery({
      id: "q1",
      prompt: "p",
      writeLine: (l) => writes.push(l),
      abortController: new AbortController(),
      tracker,
    });

    expect(parsed()).toEqual([
      { type: "stream-chunk", id: "q1", content: "partial" },
      { type: "stream-complete", id: "q1", result: { content: "partial" } },
    ]);
  });
});
