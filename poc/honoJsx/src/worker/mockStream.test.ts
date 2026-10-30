import { describe, expect, it } from "vitest";
import { createSseStream, mockTokens } from "./mockStream";

describe("mockTokens", () => {
  it("returns the requested number of non-empty tokens", () => {
    const tokens = mockTokens(50, 7);
    expect(tokens).toHaveLength(50);
    expect(tokens.every((t) => t.length > 0)).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    expect(mockTokens(30, 1)).toEqual(mockTokens(30, 1));
  });
});

describe("createSseStream", () => {
  it("encodes each token as an SSE data event and ends with a done event", async () => {
    const body = await new Response(createSseStream(["a", "改行\n"], 0)).text();
    expect(body).toBe(
      'data: {"t":"a"}\n\n' + 'data: {"t":"改行\\n"}\n\n' + "event: done\ndata: {}\n\n",
    );
  });

  it("waits the given interval between tokens using the injected sleep", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    await new Response(createSseStream(["a", "b", "c"], 15, sleep)).text();
    expect(waits).toEqual([15, 15, 15]);
  });
});
