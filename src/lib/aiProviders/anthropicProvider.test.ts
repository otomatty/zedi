import { describe, it, expect, vi, beforeEach } from "vitest";
import * as aiTypes from "@/types/ai";
import type { AIStreamChunk, AIRequest } from "./types";

const mockStream = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: function Anthropic() {
    return { messages: { stream: mockStream } };
  },
}));

import { createAnthropicProvider } from "./anthropicProvider";

const request: AIRequest = {
  prompt: "test",
  model: "claude-sonnet-4-20250514",
  messages: [{ role: "user", content: "Hello" }],
};

async function collectChunks(iterable: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
  const out: AIStreamChunk[] = [];
  for await (const c of iterable) out.push(c);
  return out;
}

describe("createAnthropicProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes correct id and capabilities", () => {
    const p = createAnthropicProvider("key");
    expect(p.id).toBe("anthropic");
    expect(p.capabilities.textGeneration).toBe(true);
    expect(p.capabilities.fileAccess).toBe(false);
  });

  describe("isAvailable", () => {
    it("returns true with API key", async () => {
      expect(await createAnthropicProvider("sk-ant-test").isAvailable()).toBe(true);
    });

    it("returns false without API key", async () => {
      expect(await createAnthropicProvider("").isAvailable()).toBe(false);
    });
  });

  it("throws when provider metadata not found", () => {
    const spy = vi.spyOn(aiTypes, "getProviderById").mockReturnValue(undefined);
    expect(() => createAnthropicProvider("key")).toThrow("metadata not found");
    spy.mockRestore();
  });

  describe("query", () => {
    it("yields text_delta events as text chunks", async () => {
      async function* events() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } };
        yield { type: "content_block_delta", delta: { type: "text_delta", text: " world" } };
      }
      mockStream.mockReturnValue(events());

      const chunks = await collectChunks(createAnthropicProvider("key").query(request));

      expect(chunks).toEqual([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
        { type: "done", content: "" },
      ]);
    });

    it("passes model to the SDK", async () => {
      async function* empty() {}
      mockStream.mockReturnValue(empty());

      await collectChunks(createAnthropicProvider("key").query(request));

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-sonnet-4-20250514" }),
        expect.anything(),
      );
    });

    it("separates system messages from chat messages", async () => {
      async function* empty() {}
      mockStream.mockReturnValue(empty());

      const req: AIRequest = {
        prompt: "test",
        model: "claude-sonnet-4",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hi" },
        ],
      };
      await collectChunks(createAnthropicProvider("key").query(req));

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({
          system: "You are helpful.",
          messages: [{ role: "user", content: "Hi" }],
        }),
        expect.anything(),
      );
    });

    it("does not include system key when no system messages", async () => {
      async function* empty() {}
      mockStream.mockReturnValue(empty());

      await collectChunks(createAnthropicProvider("key").query(request));

      const params = mockStream.mock.calls[0][0] as Record<string, unknown>;
      expect(params).not.toHaveProperty("system");
    });

    it("forwards custom maxTokens", async () => {
      async function* empty() {}
      mockStream.mockReturnValue(empty());

      await collectChunks(
        createAnthropicProvider("key").query({
          ...request,
          options: { maxTokens: 2000 },
        }),
      );

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 2000 }),
        expect.anything(),
      );
    });

    it("joins multiple system messages with double newline", async () => {
      async function* empty() {}
      mockStream.mockReturnValue(empty());

      const req: AIRequest = {
        prompt: "test",
        model: "claude-sonnet-4",
        messages: [
          { role: "system", content: "Be helpful." },
          { role: "system", content: "Be concise." },
          { role: "user", content: "Hi" },
        ],
      };
      await collectChunks(createAnthropicProvider("key").query(req));

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({ system: "Be helpful.\n\nBe concise." }),
        expect.anything(),
      );
    });

    it("stops yielding when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      async function* events() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "No" } };
      }
      mockStream.mockReturnValue(events());

      const chunks = await collectChunks(
        createAnthropicProvider("key").query(request, controller.signal),
      );

      expect(chunks).toEqual([{ type: "done", content: "" }]);
    });

    it("ignores non-text-delta events", async () => {
      async function* events() {
        yield { type: "message_start" };
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Ok" } };
        yield { type: "content_block_delta", delta: { type: "input_json_delta", text: "{}" } };
        yield { type: "message_stop" };
      }
      mockStream.mockReturnValue(events());

      const chunks = await collectChunks(createAnthropicProvider("key").query(request));

      expect(chunks).toEqual([
        { type: "text", content: "Ok" },
        { type: "done", content: "" },
      ]);
    });
  });
});
