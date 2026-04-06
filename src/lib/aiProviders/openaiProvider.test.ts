import { describe, it, expect, vi, beforeEach } from "vitest";
import * as aiTypes from "@/types/ai";
import type { AIStreamChunk, AIRequest } from "./types";

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: function OpenAI() {
    return { chat: { completions: { create: mockCreate } } };
  },
}));

import { createOpenAIProvider } from "./openaiProvider";

const request: AIRequest = {
  prompt: "test",
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Hello" }],
};

async function collectChunks(iterable: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
  const out: AIStreamChunk[] = [];
  for await (const c of iterable) out.push(c);
  return out;
}

describe("createOpenAIProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes correct id and capabilities", () => {
    const p = createOpenAIProvider("key");
    expect(p.id).toBe("openai");
    expect(p.capabilities.textGeneration).toBe(true);
    expect(p.capabilities.fileAccess).toBe(false);
    expect(p.capabilities.commandExecution).toBe(false);
  });

  describe("isAvailable", () => {
    it("returns true with API key", async () => {
      expect(await createOpenAIProvider("sk-test").isAvailable()).toBe(true);
    });

    it("returns false without API key", async () => {
      expect(await createOpenAIProvider("").isAvailable()).toBe(false);
    });
  });

  it("throws when provider metadata not found", () => {
    const spy = vi.spyOn(aiTypes, "getProviderById").mockReturnValue(undefined);
    expect(() => createOpenAIProvider("key")).toThrow("metadata not found");
    spy.mockRestore();
  });

  describe("query", () => {
    it("yields text chunks then done", async () => {
      async function* stream() {
        yield { choices: [{ delta: { content: "Hello" } }] };
        yield { choices: [{ delta: { content: " world" } }] };
      }
      mockCreate.mockResolvedValue(stream());

      const chunks = await collectChunks(createOpenAIProvider("key").query(request));

      expect(chunks).toEqual([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
        { type: "done", content: "" },
      ]);
    });

    it("passes model to the SDK", async () => {
      async function* empty() {}
      mockCreate.mockResolvedValue(empty());

      await collectChunks(createOpenAIProvider("key").query(request));

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-5-mini", stream: true }),
        expect.anything(),
      );
    });

    it("applies default options", async () => {
      async function* empty() {}
      mockCreate.mockResolvedValue(empty());

      await collectChunks(createOpenAIProvider("key").query({ ...request, options: undefined }));

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 4000, temperature: 0.7 }),
        expect.anything(),
      );
    });

    it("forwards custom maxTokens and temperature", async () => {
      async function* empty() {}
      mockCreate.mockResolvedValue(empty());

      await collectChunks(
        createOpenAIProvider("key").query({
          ...request,
          options: { maxTokens: 2000, temperature: 0.3 },
        }),
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 2000, temperature: 0.3 }),
        expect.anything(),
      );
    });

    it("stops yielding when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      async function* stream() {
        yield { choices: [{ delta: { content: "Should not appear" } }] };
      }
      mockCreate.mockResolvedValue(stream());

      const chunks = await collectChunks(
        createOpenAIProvider("key").query(request, controller.signal),
      );

      expect(chunks).toEqual([{ type: "done", content: "" }]);
    });

    it("skips empty content deltas", async () => {
      async function* stream() {
        yield { choices: [{ delta: { content: "" } }] };
        yield { choices: [{ delta: { content: "Ok" } }] };
        yield { choices: [{ delta: {} }] };
      }
      mockCreate.mockResolvedValue(stream());

      const chunks = await collectChunks(createOpenAIProvider("key").query(request));

      expect(chunks).toEqual([
        { type: "text", content: "Ok" },
        { type: "done", content: "" },
      ]);
    });
  });
});
