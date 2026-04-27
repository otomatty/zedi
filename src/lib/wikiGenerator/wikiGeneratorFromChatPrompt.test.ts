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

  // --- P3: userSchema injection tests (otomatty/zedi#597) ---

  it("does not include schema section when userSchema is undefined", () => {
    const p = buildChatPageWikiUserPrompt("Test", "outline", "conv");
    expect(p).not.toContain("<user_schema>");
    expect(p).not.toContain("ユーザー定義スキーマ");
  });

  it("does not include schema section when userSchema is empty", () => {
    const p = buildChatPageWikiUserPrompt("Test", "outline", "conv", "");
    expect(p).not.toContain("<user_schema>");
  });

  it("does not include schema section when userSchema is whitespace-only", () => {
    const p = buildChatPageWikiUserPrompt("Test", "outline", "conv", "   \n  ");
    expect(p).not.toContain("<user_schema>");
  });

  it("includes schema section when userSchema is provided", () => {
    const schema = "- Person pages: Overview, Career";
    const p = buildChatPageWikiUserPrompt("Test", "outline", "conv", schema);
    expect(p).toContain("<user_schema>");
    expect(p).toContain("Person pages: Overview, Career");
    expect(p).toContain("</user_schema>");
  });

  it("places schema before 執筆ルール", () => {
    const p = buildChatPageWikiUserPrompt("T", "o", "c", "schema rules");
    const schemaIdx = p.indexOf("<user_schema>");
    const rulesIdx = p.indexOf("## 執筆ルール");
    expect(schemaIdx).toBeGreaterThan(-1);
    expect(rulesIdx).toBeGreaterThan(-1);
    expect(schemaIdx).toBeLessThan(rulesIdx);
  });

  // issue #784: モデルが本文先頭に `# {ページタイトル}` を出さないように、
  // 「執筆ルール」で明示的に禁止していることを保証する。
  // issue #784: assert that the rule explicitly forbids a leading `# {Title}` body heading.
  it("explicitly forbids a leading `# {ページタイトル}` body heading (issue #784)", () => {
    const p = buildChatPageWikiUserPrompt("Topic", "- a", "User: hi");
    expect(p).toContain("# {ページタイトル}");
    expect(p).toContain("出力しないこと");
  });
});
