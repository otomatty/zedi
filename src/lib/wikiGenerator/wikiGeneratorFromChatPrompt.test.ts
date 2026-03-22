import { describe, it, expect } from "vitest";
import { buildChatPageWikiUserPrompt } from "./wikiGeneratorFromChatPrompt";

describe("buildChatPageWikiUserPrompt", () => {
  it("injects title, outline, and conversation", () => {
    const p = buildChatPageWikiUserPrompt("My Topic", "- a\n- b", "User: hi");
    expect(p).toContain("My Topic");
    expect(p).toContain("- a\n- b");
    expect(p).toContain("User: hi");
  });

  it("uses placeholders when outline or conversation empty", () => {
    const p = buildChatPageWikiUserPrompt("T", "", "");
    expect(p).toContain("(アウトラインなし)");
    expect(p).toContain("(会話なし)");
  });

  it("keeps outline and conversation sections when title contains placeholder-like text", () => {
    const p = buildChatPageWikiUserPrompt("About {{outline}}", "- A\n- B", "User: context");
    const outlineSection =
      p.split("## ユーザーが承認したアウトライン")[1]?.split("## 会話の文脈")[0] ?? "";
    const conversationSection = p.split("## 会話の文脈")[1]?.split("## 執筆ルール")[0] ?? "";
    expect(outlineSection).toContain("- A");
    expect(outlineSection).toContain("- B");
    expect(conversationSection).toContain("User: context");
  });
});
