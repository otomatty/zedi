import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callOpenAI,
  callAnthropic,
  callGoogle,
  getProviderApiKeyName,
  callProvider,
} from "../../services/aiProviders";
import type { AIMessage, AIChatOptions } from "../../types";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const messages: AIMessage[] = [
  { role: "system", content: "You are helpful." },
  { role: "user", content: "Hello" },
];

describe("aiProviders", () => {
  describe("callOpenAI", () => {
    it("sends correct request and parses response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "Hi there!" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
      });

      const result = await callOpenAI("sk-test", "gpt-4o", messages);

      expect(result.content).toBe("Hi there!");
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
      expect(result.finishReason).toBe("stop");

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("gpt-4o");
      expect(body.stream).toBe(false);
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      });

      await expect(callOpenAI("sk-test", "gpt-4o", messages)).rejects.toThrow(
        "OpenAI API failed: 429",
      );
    });

    it("includes web_search_options when specified", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "result" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 0, completion_tokens: 0 },
          }),
      });

      const opts: AIChatOptions = {
        useWebSearch: true,
        webSearchOptions: { search_context_size: "medium" },
      };

      await callOpenAI("sk-test", "gpt-4o", messages, opts);

      const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.web_search_options).toEqual({ search_context_size: "medium" });
    });
  });

  describe("callAnthropic", () => {
    it("separates system messages and sends correct headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ text: "Anthropic reply" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 20, output_tokens: 10 },
          }),
      });

      const result = await callAnthropic("ak-test", "claude-3", messages);

      expect(result.content).toBe("Anthropic reply");
      expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.anthropic.com/v1/messages");

      const headers = init.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("ak-test");
      expect(headers["anthropic-version"]).toBe("2023-06-01");

      const body = JSON.parse(init.body as string);
      expect(body.system).toBe("You are helpful.");
      expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server error"),
      });

      await expect(callAnthropic("ak-test", "claude-3", messages)).rejects.toThrow(
        "Anthropic API failed: 500",
      );
    });
  });

  describe("callGoogle", () => {
    it("maps roles correctly (assistant → model)", async () => {
      const googleMessages: AIMessage[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "How are you?" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "Fine!" }] }, finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 3 },
          }),
      });

      const result = await callGoogle("gk-test", "gemini-pro", googleMessages);

      expect(result.content).toBe("Fine!");
      const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.contents[0].role).toBe("user");
      expect(body.contents[1].role).toBe("model");
      expect(body.contents[2].role).toBe("user");
    });

    it("includes systemInstruction and googleSearch tool when specified", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
          }),
      });

      await callGoogle("gk-test", "gemini-pro", messages, { useGoogleSearch: true });

      const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.systemInstruction).toEqual({ parts: [{ text: "You are helpful." }] });
      expect(body.tools).toEqual([{ googleSearch: {} }]);
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad request"),
      });

      await expect(callGoogle("gk-test", "gemini-pro", messages)).rejects.toThrow(
        "Google AI API failed: 400",
      );
    });
  });

  describe("getProviderApiKeyName", () => {
    it("returns correct key names", () => {
      expect(getProviderApiKeyName("openai")).toBe("OPENAI_API_KEY");
      expect(getProviderApiKeyName("anthropic")).toBe("ANTHROPIC_API_KEY");
      expect(getProviderApiKeyName("google")).toBe("GOOGLE_AI_API_KEY");
    });

    it("throws for unknown provider", () => {
      expect(() => getProviderApiKeyName("azure" as unknown)).toThrow("Unknown provider");
    });
  });

  describe("callProvider", () => {
    it("dispatches to correct provider", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 0, completion_tokens: 0 },
          }),
      });

      await callProvider("openai", "sk-test", "gpt-4o", messages);

      const url = mockFetch.mock.calls[0]?.[0] as string;
      expect(url).toContain("openai.com");
    });
  });
});
