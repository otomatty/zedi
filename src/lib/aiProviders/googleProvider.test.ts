import { describe, it, expect, vi, beforeEach } from "vitest";
import * as aiTypes from "@/types/ai";
import type { AIStreamChunk, AIRequest } from "./types";

const mockGenerateContentStream = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: function GoogleGenAI() {
    return { models: { generateContentStream: mockGenerateContentStream } };
  },
}));

import { createGoogleProvider } from "./googleProvider";

const request: AIRequest = {
  prompt: "test",
  model: "gemini-3-flash-preview",
  messages: [{ role: "user", content: "Hello" }],
};

async function collectChunks(iterable: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
  const out: AIStreamChunk[] = [];
  for await (const c of iterable) out.push(c);
  return out;
}

describe("createGoogleProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes correct id and capabilities", () => {
    const p = createGoogleProvider("key");
    expect(p.id).toBe("google");
    expect(p.capabilities.textGeneration).toBe(true);
    expect(p.capabilities.fileAccess).toBe(false);
  });

  describe("isAvailable", () => {
    it("returns true with API key", async () => {
      expect(await createGoogleProvider("AIza-test").isAvailable()).toBe(true);
    });

    it("returns false without API key", async () => {
      expect(await createGoogleProvider("").isAvailable()).toBe(false);
    });
  });

  it("throws when provider metadata not found", () => {
    const spy = vi.spyOn(aiTypes, "getProviderById").mockReturnValue(undefined);
    expect(() => createGoogleProvider("key")).toThrow("metadata not found");
    spy.mockRestore();
  });

  describe("query", () => {
    it("yields text chunks then done", async () => {
      async function* stream() {
        yield { text: "Hello" };
        yield { text: " world" };
      }
      mockGenerateContentStream.mockResolvedValue(stream());

      const chunks = await collectChunks(createGoogleProvider("key").query(request));

      expect(chunks).toEqual([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
        { type: "done", content: "" },
      ]);
    });

    it("passes model to the SDK", async () => {
      async function* empty() {}
      mockGenerateContentStream.mockResolvedValue(empty());

      await collectChunks(createGoogleProvider("key").query(request));

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gemini-3-flash-preview" }),
      );
    });

    it("enables Google Search by default", async () => {
      async function* empty() {}
      mockGenerateContentStream.mockResolvedValue(empty());

      await collectChunks(createGoogleProvider("key").query(request));

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            tools: [{ googleSearch: {} }],
          }),
        }),
      );
    });

    it("forwards custom maxTokens and temperature", async () => {
      async function* empty() {}
      mockGenerateContentStream.mockResolvedValue(empty());

      await collectChunks(
        createGoogleProvider("key").query({
          ...request,
          options: { maxTokens: 2000, temperature: 0.3 },
        }),
      );

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            maxOutputTokens: 2000,
            temperature: 0.3,
          }),
        }),
      );
    });

    it("joins multiple message contents", async () => {
      async function* empty() {}
      mockGenerateContentStream.mockResolvedValue(empty());

      const req: AIRequest = {
        prompt: "test",
        model: "gemini-3-flash",
        messages: [
          { role: "user", content: "First" },
          { role: "user", content: "Second" },
        ],
      };
      await collectChunks(createGoogleProvider("key").query(req));

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({ contents: "First\n\nSecond" }),
      );
    });

    it("stops yielding when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      async function* stream() {
        yield { text: "Should not appear" };
      }
      mockGenerateContentStream.mockResolvedValue(stream());

      const chunks = await collectChunks(
        createGoogleProvider("key").query(request, controller.signal),
      );

      expect(chunks).toEqual([{ type: "done", content: "" }]);
    });

    it("skips falsy text chunks", async () => {
      async function* stream() {
        yield { text: null };
        yield { text: "Ok" };
        yield { text: undefined };
        yield { text: "" };
      }
      mockGenerateContentStream.mockResolvedValue(stream());

      const chunks = await collectChunks(createGoogleProvider("key").query(request));

      expect(chunks).toEqual([
        { type: "text", content: "Ok" },
        { type: "done", content: "" },
      ]);
    });
  });
});
