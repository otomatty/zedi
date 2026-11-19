import { describe, expect, it } from "vitest";
import { createSseParser, type SseEvent } from "./sseParser";

function collect(chunks: string[]): SseEvent[] {
  const events: SseEvent[] = [];
  const parser = createSseParser((e) => events.push(e));
  chunks.forEach((c) => parser.feed(c));
  return events;
}

describe("createSseParser", () => {
  it("emits a default message event at the blank line", () => {
    expect(collect(['data: {"t":"a"}\n\n'])).toEqual([{ event: "message", data: '{"t":"a"}' }]);
  });

  it("reassembles an event split across chunks", () => {
    expect(collect(["da", 'ta: {"t"', ':"b"}\n', "\n"])).toEqual([
      { event: "message", data: '{"t":"b"}' },
    ]);
  });

  it("handles named events, multi-line data, CRLF and comments", () => {
    expect(collect([": ping\r\n\r\nevent: done\r\ndata: 1\r\ndata: 2\r\n\r\n"])).toEqual([
      { event: "done", data: "1\n2" },
    ]);
  });

  it("does not emit until the event is terminated", () => {
    expect(collect(["data: partial\n"])).toEqual([]);
  });
});
