import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./aiChatPrompt";
import type { PageContext, ReferencedPage } from "../types/aiChat";

describe("buildSystemPrompt", () => {
  it("includes existing page titles in system prompt", () => {
    const titles = ["ページA", "ページB", "ページC"];
    const result = buildSystemPrompt(null, titles);
    expect(result).toContain("- ページA");
    expect(result).toContain("- ページB");
    expect(result).toContain("- ページC");
  });

  it("builds editor context with page title and content", () => {
    const context: PageContext = {
      type: "editor",
      pageTitle: "テストページ",
      pageContent: "これはテスト内容です",
    };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("テストページ");
    expect(result).toContain("これはテスト内容です");
    expect(result).toContain("編集/閲覧しています");
  });

  it("builds home context with recent page titles", () => {
    const context: PageContext = {
      type: "home",
      recentPageTitles: ["最近のページ1", "最近のページ2"],
    };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("ホーム画面");
    expect(result).toContain("- 最近のページ1");
    expect(result).toContain("- 最近のページ2");
  });

  it("builds search context with query", () => {
    const context: PageContext = {
      type: "search",
      searchQuery: "検索キーワード",
    };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("検索キーワード");
    expect(result).toContain("検索を行っています");
  });

  it("handles null context", () => {
    const result = buildSystemPrompt(null, ["ページ1"]);
    expect(result).toContain("Zedi");
    expect(result).toContain("- ページ1");
    expect(result).not.toContain("現在のコンテキスト");
  });

  it("uses default editor title when pageTitle is missing", () => {
    const context: PageContext = {
      type: "editor",
      pageContent: "本文のみ",
    };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("無題のページ");
    expect(result).toContain("本文のみ");
  });

  it("omits page body subsection when editor has no pageContent", () => {
    const context: PageContext = { type: "editor", pageTitle: "タイトルのみ" };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("タイトルのみ");
    expect(result).not.toContain("### ページ内容:");
  });

  it("does not list recent pages when home recentPageTitles is empty", () => {
    const context: PageContext = { type: "home", recentPageTitles: [] };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("ホーム画面");
    expect(result).not.toContain("### 最近のページ:");
  });

  it("search context with empty query still describes search state", () => {
    const context: PageContext = { type: "search", searchQuery: "" };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("で検索を行っています");
  });

  it("includes referenced pages section", () => {
    const referenced: ReferencedPage[] = [
      { id: "p1", title: "参照ページ1" },
      { id: "p2", title: "参照ページ2" },
    ];
    const result = buildSystemPrompt(null, [], referenced);
    expect(result).toContain("参照ページ");
    expect(result).toContain("### 参照ページ1");
    expect(result).toContain("(ページID: p1)");
    expect(result).toContain("### 参照ページ2");
    expect(result).toContain("(ページID: p2)");
  });

  it("returns empty referenced pages section when no pages", () => {
    const result = buildSystemPrompt(null, []);
    expect(result).not.toContain("### ");
    expect(result).not.toContain("ページID:");
  });
});
