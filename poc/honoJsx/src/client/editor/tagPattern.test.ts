import { describe, expect, it } from "vitest";
import { extractTagAtEnd } from "./tagPattern";

describe("extractTagAtEnd", () => {
  it.each([
    ["hello #zedi ", "zedi"],
    ["#知識 ", "知識"],
    ["メモ #design-system ", "design-system"],
    ["#a_1 ", "a_1"],
  ])("extracts the tag from %j", (text, tag) => {
    expect(extractTagAtEnd(text)).toBe(tag);
  });

  it.each([["a#b "], ["# "], ["#tag"], ["##tag "]])("ignores %j", (text) => {
    expect(extractTagAtEnd(text)).toBeNull();
  });
});
