import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AISettings } from "@/types/ai";

// 各 SDK のクライアントをモック化 / Mock each SDK client.
const openaiCreate = vi.fn();
const anthropicCreate = vi.fn();
const googleGenerateContent = vi.fn();

vi.mock("@/lib/aiClient", () => ({
  createAIClient: vi.fn((settings: AISettings) => {
    switch (settings.provider) {
      case "openai":
        return { chat: { completions: { create: openaiCreate } } };
      case "anthropic":
        return { messages: { create: anthropicCreate } };
      case "google":
        return { models: { generateContent: googleGenerateContent } };
      default:
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
  }),
}));

// fileToBase64 は image/* MIME なら決定的な base64 を返すようモック
// Mock fileToBase64 to return a deterministic base64 string for image files.
vi.mock("@/lib/storage/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/types")>();
  return {
    ...actual,
    fileToBase64: vi.fn(async () => "BASE64DATA"),
  };
});

import { describeImage } from "./describeImage";

const imageFile = () => new File([new Uint8Array([1, 2])], "img.png", { type: "image/png" });

const makeSettings = (override: Partial<AISettings> = {}): AISettings => ({
  provider: "openai",
  apiKey: "sk-test",
  apiMode: "user_api_key",
  model: "gpt-5-mini",
  modelId: "openai:gpt-5-mini",
  isConfigured: true,
  ...override,
});

describe("describeImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when AISettings.isConfigured is false / AI 未設定なら throw", async () => {
    await expect(describeImage(imageFile(), makeSettings({ isConfigured: false }))).rejects.toThrow(
      /not configured|未設定|AI/i,
    );
  });

  it("throws for claude-code provider / claude-code は未対応として throw", async () => {
    await expect(
      describeImage(
        imageFile(),
        makeSettings({ provider: "claude-code", model: "", modelId: "claude-code:default" }),
      ),
    ).rejects.toThrow(/claude-code|claude code|not supported/i);
  });

  it("calls OpenAI chat.completions.create with image_url content / OpenAI は image_url 形式", async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "An image of a cat." } }],
    });

    const result = await describeImage(imageFile(), makeSettings({ provider: "openai" }));

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const call = openaiCreate.mock.calls[0][0];
    expect(call.model).toBe("gpt-5-mini");
    expect(Array.isArray(call.messages)).toBe(true);
    const userMessage = call.messages[0];
    expect(userMessage.role).toBe("user");
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({
          type: "image_url",
          image_url: expect.objectContaining({
            url: expect.stringContaining("data:image/png;base64,BASE64DATA"),
          }),
        }),
      ]),
    );
    expect(result).toBe("An image of a cat.");
  });

  it("calls Anthropic messages.create with base64 image block / Anthropic は base64 image ブロック", async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Anthropic description" }],
    });

    const result = await describeImage(
      imageFile(),
      makeSettings({
        provider: "anthropic",
        model: "claude-opus-4-6",
        modelId: "anthropic:claude-opus-4-6",
      }),
    );

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const call = anthropicCreate.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-6");
    expect(typeof call.max_tokens).toBe("number");
    const userMessage = call.messages[0];
    expect(userMessage.role).toBe("user");
    expect(userMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image",
          source: expect.objectContaining({
            type: "base64",
            media_type: "image/png",
            data: "BASE64DATA",
          }),
        }),
        expect.objectContaining({ type: "text" }),
      ]),
    );
    expect(result).toBe("Anthropic description");
  });

  it("calls Google generateContent with inlineData / Google は inlineData 形式", async () => {
    googleGenerateContent.mockResolvedValue({ text: "Gemini description" });

    const result = await describeImage(
      imageFile(),
      makeSettings({
        provider: "google",
        model: "gemini-3-pro-preview",
        modelId: "google:gemini-3-pro-preview",
      }),
    );

    expect(googleGenerateContent).toHaveBeenCalledTimes(1);
    const call = googleGenerateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-3-pro-preview");
    const firstContent = Array.isArray(call.contents) ? call.contents[0] : call.contents;
    const parts = firstContent.parts ?? firstContent;
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inlineData: expect.objectContaining({
            mimeType: "image/png",
            data: "BASE64DATA",
          }),
        }),
        expect.objectContaining({ text: expect.any(String) }),
      ]),
    );
    expect(result).toBe("Gemini description");
  });

  it("respects a custom prompt override / カスタムプロンプトを優先する", async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });

    await describeImage(imageFile(), makeSettings({ provider: "openai" }), {
      prompt: "画像を一行で",
    });

    const call = openaiCreate.mock.calls[0][0];
    const textPart = call.messages[0].content.find(
      (c: { type: string; text?: string }) => c.type === "text",
    );
    expect(textPart.text).toBe("画像を一行で");
  });

  it("throws AbortError if signal is already aborted / 既に abort 済みなら throw", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      describeImage(imageFile(), makeSettings({ provider: "openai" }), {
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);
  });
});
