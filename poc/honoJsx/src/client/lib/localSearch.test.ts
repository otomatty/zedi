import { describe, expect, it } from "vitest";
import { searchLoadedPages } from "./localSearch";

const item = (id: string, title: string, preview = "") => ({ id, title, preview, updatedAt: 0 });

describe("searchLoadedPages", () => {
  it("matches titles and previews without regard to case", () => {
    const pages = [
      item("1", "Durable Objects"),
      item("2", "メモ", "durable な保存"),
      item("3", "x"),
    ];

    expect(searchLoadedPages(pages, "DURABLE").map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("ignores surrounding spaces and returns nothing for an empty query", () => {
    expect(searchLoadedPages([item("1", "abc")], "  ")).toEqual([]);
    expect(searchLoadedPages([item("1", "abc")], " b ").map((p) => p.id)).toEqual(["1"]);
  });

  it("lists each page once and stops at the limit", () => {
    const pages = [item("1", "a1"), item("1", "a1"), item("2", "a2"), item("3", "a3")];

    expect(searchLoadedPages(pages, "a", 2).map((p) => p.id)).toEqual(["1", "2"]);
  });
});
