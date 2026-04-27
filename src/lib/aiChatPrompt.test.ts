import { describe, it, expect, beforeEach } from "vitest";
import { buildSystemPrompt } from "./aiChatPrompt";
import type { PageContext, ReferencedPage } from "../types/aiChat";
import i18n from "@/i18n";

describe("buildSystemPrompt", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });
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

  it("includes referenced pages section", () => {
    const referenced: ReferencedPage[] = [
      { id: "p1", title: "参照ページ1" },
      { id: "p2", title: "参照ページ2" },
    ];
    const result = buildSystemPrompt(null, [], referenced);
    expect(result).toContain("\n## 参照ページ\n");
    expect(result).toContain(
      "ユーザーが以下のページをAIチャットの参照として追加しています。これらのページの情報を踏まえて回答してください。\n",
    );
    expect(result).toContain("\n### 参照ページ1\n(ページID: p1)\n");
    expect(result).toContain("\n### 参照ページ2\n(ページID: p2)\n");
  });

  it("returns empty referenced pages section when no pages", () => {
    const result = buildSystemPrompt(null, []);
    expect(result).not.toContain("## 参照ページ");
    expect(result).not.toContain("ページID:");
  });

  it("uses default context copy when type is other", () => {
    const context: PageContext = { type: "other" };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("## 現在のコンテキスト");
    expect(result).toContain("特定のページコンテキストはありません。");
  });

  it("lists recent home pages with exact bullet lines", () => {
    const context: PageContext = {
      type: "home",
      recentPageTitles: ["Alpha", "Beta"],
    };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("### 最近のページ:\n- Alpha\n- Beta\n");
  });

  it("renders search line with empty query between quotes", () => {
    const context: PageContext = { type: "search", searchQuery: "" };
    const result = buildSystemPrompt(context, []);
    expect(result).toContain("ユーザーは現在「」で検索を行っています。");
  });

  it("maps existing page titles to markdown bullets", () => {
    const result = buildSystemPrompt(null, ["One", "Two"]);
    expect(result).toContain("ユーザーの既存ページタイトル一覧:\n- One\n- Two");
  });

  it("does not inject placeholder text when context is null", () => {
    const result = buildSystemPrompt(null, []);
    expect(result).not.toMatch(/Stryker was here/);
  });

  it("uses exact referenced page title in heading line", () => {
    const referenced: ReferencedPage[] = [{ id: "id1", title: "UniqueRefTitleZedi395" }];
    const result = buildSystemPrompt(null, [], referenced);
    expect(result).toContain("\n### UniqueRefTitleZedi395\n(ページID: id1)\n");
  });
});
