import { describe, expect, it } from "vitest";
import { SLASH_ITEMS, filterSlashItems } from "./slashItems";

describe("filterSlashItems", () => {
  it("returns every item for an empty query", () => {
    expect(filterSlashItems("")).toEqual(SLASH_ITEMS);
  });

  it("matches titles and keywords in English and Japanese", () => {
    expect(filterSlashItems("h1").map((i) => i.id)).toEqual(["heading1"]);
    expect(filterSlashItems("見出し").map((i) => i.id)).toEqual(["heading1", "heading2"]);
    expect(filterSlashItems("CODE").map((i) => i.id)).toEqual(["codeBlock"]);
  });

  it("returns nothing for an unknown command", () => {
    expect(filterSlashItems("unknown-command")).toEqual([]);
  });
});
