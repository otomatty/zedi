/**
 * `composeService` SSE 経路ユニットテスト (#950)。
 *
 * `runSession` の SSE パーサが多行 data:, 複数イベント連結, `event:` 名 (未使用),
 * 不完全レコードを正しく扱えるかを `ReadableStream` モックで検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSession } from "./composeService";
import type { ComposeSseEvent } from "./types";

function makeReadable(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(chunks[i] as string));
      i += 1;
    },
  });
}

function makeFetchOk(chunks: string[]): typeof fetch {
  return vi.fn(async () => {
    const body = makeReadable(chunks);
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  });
}

describe("composeService.runSession SSE parsing", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetchOk([]));
  });

  it("dispatches multiple events from a single stream", async () => {
    const stream = [
      `event: started\n`,
      `data: ${JSON.stringify({ type: "started", sessionId: "s1", graphId: "g1" })}\n\n`,
      `event: compose_phase\n`,
      `data: ${JSON.stringify({ type: "compose_phase", phase: "brief", status: "entered" })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ type: "done", status: "completed" })}\n\n`,
    ];
    vi.stubGlobal("fetch", makeFetchOk(stream));

    const events: ComposeSseEvent[] = [];
    await runSession({
      pageId: "page-1",
      sessionId: "sess-1",
      onEvent: (e) => {
        events.push(e);
      },
    });

    expect(events.map((e) => e.type)).toEqual(["started", "compose_phase", "done"]);
  });

  it("handles a record split across two fetch chunks", async () => {
    const json = JSON.stringify({ type: "token", content: "hello" });
    const stream = [
      // The split intentionally falls inside the `data:` payload.
      `event: token\ndata: ${json.slice(0, 5)}`,
      `${json.slice(5)}\n\n`,
    ];
    vi.stubGlobal("fetch", makeFetchOk(stream));

    const events: ComposeSseEvent[] = [];
    await runSession({
      pageId: "page-1",
      sessionId: "sess-1",
      onEvent: (e) => {
        events.push(e);
      },
    });

    expect(events).toEqual([{ type: "token", content: "hello" }]);
  });

  it("skips unparseable records without throwing", async () => {
    const goodEvent = JSON.stringify({ type: "status", phase: "completed" });
    const stream = [
      `event: garbled\ndata: {not json}\n\n`,
      `event: status\ndata: ${goodEvent}\n\n`,
    ];
    vi.stubGlobal("fetch", makeFetchOk(stream));

    const events: ComposeSseEvent[] = [];
    await runSession({
      pageId: "page-1",
      sessionId: "sess-1",
      onEvent: (e) => {
        events.push(e);
      },
    });

    expect(events).toEqual([{ type: "status", phase: "completed" }]);
  });

  it("aborts when the AbortSignal fires", async () => {
    // Build a stream that never closes so we can verify the abort path.
    // 終わらないストリームを作って abort パスを確認する。
    const controller = new AbortController();
    const dataLine = `event: token\ndata: ${JSON.stringify({ type: "token", content: "x" })}\n\n`;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls += 1;
        c.enqueue(new TextEncoder().encode(dataLine));
        if (pulls === 2) controller.abort();
      },
    });
    vi.stubGlobal("fetch", async () => new Response(stream, { status: 200 }));

    const events: ComposeSseEvent[] = [];
    await expect(
      runSession({
        pageId: "page-1",
        sessionId: "sess-1",
        onEvent: (e) => {
          events.push(e);
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);

    expect(events.length).toBeGreaterThan(0);
  });
});
