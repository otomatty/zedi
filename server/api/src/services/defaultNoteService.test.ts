/**
 * defaultNoteService の単体テスト。タイトル整形と冪等な保証ロジックを検証する。
 * Unit tests for defaultNoteService: title formatting and idempotent ensure.
 */
import { describe, it, expect } from "vitest";
import { formatDefaultNoteTitle } from "./defaultNoteService.js";

describe("formatDefaultNoteTitle", () => {
  it("appends 'のノート' to the user name", () => {
    expect(formatDefaultNoteTitle("山田")).toBe("山田のノート");
  });

  it("works with English names", () => {
    expect(formatDefaultNoteTitle("Alice")).toBe("Aliceのノート");
  });

  it("preserves whitespace inside the name", () => {
    // 表示名にスペースが含まれていても切り落とさず、そのまま連結する。
    // Whitespace in the display name is preserved verbatim.
    expect(formatDefaultNoteTitle("Alice Bob")).toBe("Alice Bobのノート");
  });
});
