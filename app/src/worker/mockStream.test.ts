import { describe, expect, it } from "vitest";
import { createSseStream, mockMarkdownTokens, mockTokens } from "./mockStream";

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

describe("mockMarkdownTokens", () => {
  it("returns the requested number of small, deterministic tokens", () => {
    const tokens = mockMarkdownTokens(500, 3);
    expect(tokens).toHaveLength(500);
    expect(tokens.every((t) => t.length >= 1 && t.length <= 4)).toBe(true);
    expect(mockMarkdownTokens(500, 3)).toEqual(tokens);
  });

  it("mixes token sizes from 1 to 4 characters, as the benchmark workload says", () => {
    // 計測用の負荷が 1 文字の断片ばかりに偏らないこと（シード 1 は計測スクリプトの既定値）。
    // The benchmark workload must not collapse into one-character tokens (seed 1 is the default).
    const sizes = new Map<number, number>();
    for (const token of mockMarkdownTokens(2_000, 1)) {
      sizes.set(token.length, (sizes.get(token.length) ?? 0) + 1);
    }
    for (const size of [1, 2, 3, 4]) {
      expect(sizes.get(size) ?? 0, `${size}-character tokens`).toBeGreaterThan(200);
    }
  });

  it("streams a realistic Markdown answer (headings, lists, code, tables, quotes)", () => {
    const text = mockMarkdownTokens(2_000, 1).join("");
    expect(text).toMatch(/^## /m);
    expect(text).toMatch(/^- /m);
    expect(text).toMatch(/^```ts$/m);
    expect(text).toMatch(/^\| .* \|$/m);
    expect(text).toMatch(/^> /m);
  });
});
