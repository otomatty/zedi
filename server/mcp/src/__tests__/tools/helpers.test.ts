/**
 * MCP ツールヘルパのユニットテスト
 *
 * - `wrapToolHandler` が `ZediApiError` を `isError: true` の結果に正規化すること
 * - 429 (レート制限) は専用メッセージを出すこと
 * - その他の例外は "Unexpected error" にまとめること
 *
 * Tests for the MCP tool helpers, including #562 rate-limit rendering.
 */
import { describe, it, expect } from "vitest";
import { wrapToolHandler } from "../../tools/helpers.js";
import { ZediApiError } from "../../client/errors.js";

describe("wrapToolHandler", () => {
  it("returns a rate-limit message with retry seconds for 429 errors", async () => {
    const result = await wrapToolHandler(async () => {
      throw new ZediApiError(429, "RATE_LIMIT_EXCEEDED", undefined, 42);
    }, {});
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/rate limited/i);
    expect(text).toMatch(/42 seconds/);
  });

  it("falls back to a generic retry message when retryAfterSec is missing", async () => {
    const result = await wrapToolHandler(async () => {
      throw new ZediApiError(429, "RATE_LIMIT_EXCEEDED");
    }, {});
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/rate limited/i);
    expect(text).toMatch(/retry later/i);
  });

  it("renders non-rate-limit ZediApiError with its status and message", async () => {
    const result = await wrapToolHandler(async () => {
      throw new ZediApiError(404, "Page not found");
    }, {});
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/HTTP 404/);
    expect(text).toMatch(/Page not found/);
  });

  it("labels fetch network failures (status=0) as 'network'", async () => {
    const result = await wrapToolHandler(async () => {
      throw new ZediApiError(0, "ECONNREFUSED");
    }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/network/i);
  });

  it("falls back to Unexpected error for non-ZediApiError throws", async () => {
    const result = await wrapToolHandler(async () => {
      throw new Error("boom");
    }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Unexpected error/);
    expect(result.content[0]?.text).toMatch(/boom/);
  });

  it("passes through successful results untouched", async () => {
    const result = await wrapToolHandler(
      async (input: { x: number }) => ({
        content: [{ type: "text" as const, text: `x=${input.x}` }],
      }),
      { x: 7 },
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toBe("x=7");
  });
});
