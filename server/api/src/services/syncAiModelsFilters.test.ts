/**
 * syncAiModelsFilters の単体テスト（純粋関数）
 */
import { describe, it, expect } from "vitest";
import {
  isTextChatModel,
  isLatestGeneration,
  isSonnetModel,
  assignTier,
  parseAllowlist,
} from "./syncAiModelsFilters.js";

describe("isTextChatModel", () => {
  it("openai: gpt-4 は true", () => {
    expect(isTextChatModel("openai", "gpt-4")).toBe(true);
  });

  it("openai: image/tts を含む ID は false", () => {
    expect(isTextChatModel("openai", "gpt-4-image")).toBe(false);
    expect(isTextChatModel("openai", "tts-1")).toBe(false);
    expect(isTextChatModel("openai", "whisper-audio")).toBe(false);
  });

  it("google: gemini テキストは true", () => {
    expect(isTextChatModel("google", "gemini-2.0-flash")).toBe(true);
  });

  it("google: imagen は false", () => {
    expect(isTextChatModel("google", "imagen-3")).toBe(false);
  });

  it("anthropic は true（除外パターンなし）", () => {
    expect(isTextChatModel("anthropic", "claude-sonnet-4")).toBe(true);
  });
});

describe("isLatestGeneration", () => {
  it("openai: 日付サフィックスは false", () => {
    expect(isLatestGeneration("openai", "gpt-4-2024-01-15")).toBe(false);
  });

  it("openai: gpt-3.5 は false", () => {
    expect(isLatestGeneration("openai", "gpt-3.5-turbo")).toBe(false);
  });

  it("openai: gpt-4 は true", () => {
    expect(isLatestGeneration("openai", "gpt-4")).toBe(true);
  });

  it("anthropic: 日付8桁サフィックスは false", () => {
    expect(isLatestGeneration("anthropic", "claude-sonnet-20240101")).toBe(false);
  });

  it("anthropic: claude-3 は false", () => {
    expect(isLatestGeneration("anthropic", "claude-3-sonnet")).toBe(false);
  });

  it("anthropic: claude-sonnet-4 は true", () => {
    expect(isLatestGeneration("anthropic", "claude-sonnet-4")).toBe(true);
  });

  it("google: -latest は false", () => {
    expect(isLatestGeneration("google", "gemini-2.0-flash-latest")).toBe(false);
  });

  it("google: customtools は false", () => {
    expect(isLatestGeneration("google", "gemini-customtools")).toBe(false);
  });

  it("google: gemini-2.0-flash は true", () => {
    expect(isLatestGeneration("google", "gemini-2.0-flash")).toBe(true);
  });
});

describe("isSonnetModel", () => {
  it("sonnet を含む ID は true", () => {
    expect(isSonnetModel("anthropic", "claude-sonnet-4")).toBe(true);
    expect(isSonnetModel("anthropic", "claude-sonnet-4-6")).toBe(true);
  });

  it("sonnet を含まない ID は false", () => {
    expect(isSonnetModel("anthropic", "claude-haiku-4")).toBe(false);
    expect(isSonnetModel("openai", "gpt-4")).toBe(false);
  });
});

describe("assignTier", () => {
  it("openai: mini/nano は free", () => {
    expect(assignTier("openai", "gpt-4o-mini")).toBe("free");
    expect(assignTier("openai", "gpt-4-nano")).toBe("free");
  });

  it("openai: それ以外は pro", () => {
    expect(assignTier("openai", "gpt-4")).toBe("pro");
  });

  it("anthropic: haiku は free、sonnet は pro", () => {
    expect(assignTier("anthropic", "claude-haiku-4")).toBe("free");
    expect(assignTier("anthropic", "claude-sonnet-4")).toBe("pro");
  });

  it("anthropic: opus は pro", () => {
    expect(assignTier("anthropic", "claude-opus-4")).toBe("pro");
  });

  it("google: pro を含むと pro", () => {
    expect(assignTier("google", "gemini-1.5-pro")).toBe("pro");
  });

  it("google: それ以外は free", () => {
    expect(assignTier("google", "gemini-2.0-flash")).toBe("free");
  });
});

describe("parseAllowlist", () => {
  it("空文字・未設定は null", () => {
    expect(parseAllowlist("")).toBe(null);
    expect(parseAllowlist("   ")).toBe(null);
  });

  it("カンマ区切りで Set を返す", () => {
    const set = parseAllowlist("gpt-4, gpt-4o-mini , o1");
    expect(set).not.toBe(null);
    if (!set) throw new Error("unreachable");
    expect(set.has("gpt-4")).toBe(true);
    expect(set.has("gpt-4o-mini")).toBe(true);
    expect(set.has("o1")).toBe(true);
    expect(set.size).toBe(3);
  });

  it("空の ID は除外", () => {
    const set = parseAllowlist("a,,b");
    expect(set).not.toBe(null);
    if (!set) throw new Error("unreachable");
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("ID が 0 件の場合は null", () => {
    expect(parseAllowlist(",")).toBe(null);
  });
});
