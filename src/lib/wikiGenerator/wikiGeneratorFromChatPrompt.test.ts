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
});
