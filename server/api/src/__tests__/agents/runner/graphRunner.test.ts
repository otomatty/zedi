/**
 * GraphRunner のテスト。registry にスタブ graph を登録した状態で invoke /
 * streamEvents が registry を介して動くことを確認する。実 LangGraph を起動して
 * `END` ノードまで走らせるため、ここではモック graph ではなく `stubGraph` を使う。
 *
 * Tests for {@link GraphRunner}: registry resolution, invoke happy path,
 * streamEvents iteration, and resume payload shape. Uses the real
 * `wiki-compose-stub` graph (no external IO) instead of a hand-rolled mock so
 * the test stays close to production runtime behaviour.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GraphRunner } from "../../../agents/runner/graphRunner.js";
import {
  GraphNotRegisteredError,
  __resetRegistryForTests,
  registerGraph,
} from "../../../agents/registry/graphRegistry.js";
import { STUB_GRAPH_ID, registerStubGraph } from "../../../agents/registry/stubGraph.js";
import type { GraphContext } from "../../../agents/core/types/graphContext.js";
import type { Database } from "../../../types/index.js";

function fakeContext(): GraphContext {
  return {
    threadId: "thread-1",
    sessionId: "thread-1",
    userId: "user-1",
    pageId: "page-1",
    graphId: STUB_GRAPH_ID,
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "test",
    userEmail: null,
  };
}

describe("GraphRunner.invoke", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerStubGraph();
  });
  afterEach(() => {
    __resetRegistryForTests();
  });

  it("executes the stub graph end-to-end and marks the run completed", async () => {
    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: STUB_GRAPH_ID,
        context: fakeContext(),
        checkpointer: false,
      },
      { kind: "input", value: { messages: [] } },
    );

    expect(result.status).toBe("completed");
    // The stub graph sets `phase` to "completed" in its single node.
    // スタブグラフは noop ノードで phase を completed にする。
    expect((result.output as { phase?: string })?.phase).toBe("completed");
  });

  it("throws GraphNotRegisteredError for an unknown graphId", async () => {
    const runner = new GraphRunner();
    await expect(
      runner.invoke(
        { graphId: "does-not-exist", context: fakeContext(), checkpointer: false },
        { kind: "input", value: {} },
      ),
    ).rejects.toBeInstanceOf(GraphNotRegisteredError);
  });

  it("passes thread_id and the zedi graph context through configurable", async () => {
    let capturedConfig: unknown;
    registerGraph({
      id: "spy-graph",
      version: "0.0.0",
      phase: "spy",
      description: "captures the runnable config",
      factory: () => ({
        async invoke(_input: unknown, options: unknown) {
          capturedConfig = options;
          return { ok: true };
        },
        async stream() {
          throw new Error("not used");
        },
        streamEvents() {
          throw new Error("not used");
        },
      }),
    });

    const runner = new GraphRunner();
    await runner.invoke(
      { graphId: "spy-graph", context: fakeContext(), checkpointer: false },
      { kind: "input", value: {} },
    );

    const cfg = capturedConfig as {
      configurable: Record<string, unknown>;
      recursionLimit: number;
    };
    expect(cfg.configurable.thread_id).toBe("thread-1");
    expect(cfg.configurable.zediGraphContext).toMatchObject({
      threadId: "thread-1",
      userId: "user-1",
      pageId: "page-1",
    });
    expect(cfg.recursionLimit).toBe(25);
  });
});

describe("GraphRunner.streamEvents", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerStubGraph();
  });
  afterEach(() => {
    __resetRegistryForTests();
  });

  it("returns an async iterable that emits at least one event", async () => {
    const runner = new GraphRunner();
    const events = runner.streamEvents(
      { graphId: STUB_GRAPH_ID, context: fakeContext(), checkpointer: false },
      { kind: "input", value: { messages: [] } },
    );

    const collected: unknown[] = [];
    for await (const ev of events) {
      collected.push(ev);
    }
    // The stub graph is small but always produces multiple lifecycle events
    // (chain_start / chain_end at minimum). We only assert non-empty so the
    // test is robust against LangGraph version changes.
    // LangGraph のバージョン差を吸収するため、件数だけ確認する。
    expect(collected.length).toBeGreaterThan(0);
  });
});

describe("GraphRunner.resume", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });
  afterEach(() => {
    __resetRegistryForTests();
  });

  it("invokes the graph with a Command({ resume }) payload", async () => {
    let captured: unknown;
    registerGraph({
      id: "resume-spy",
      version: "0.0.0",
      phase: "spy",
      description: "captures resume payloads",
      factory: () => ({
        async invoke(input: unknown) {
          captured = input;
          return {};
        },
        async stream() {
          throw new Error("not used");
        },
        streamEvents() {
          throw new Error("not used");
        },
      }),
    });

    const runner = new GraphRunner();
    await runner.resume(
      { graphId: "resume-spy", context: fakeContext(), checkpointer: false },
      { answer: "yes" },
    );

    expect(captured).toBeDefined();
    // LangGraph `Command` carries a `resume` field that holds the user payload.
    expect((captured as { resume?: unknown }).resume).toEqual({ answer: "yes" });
  });
});
