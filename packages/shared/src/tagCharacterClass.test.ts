/**
 * `TAG_NAME_CHAR_CLASS` の最低限のスペックテスト。文字列リテラル仕様（正規表現
 * の文字クラス内側のみ、グローバル/アンカー無し）と、組み立てた正規表現が
 * 期待通りの字種を受理／拒否することを確認する。
 *
 * Lock down the minimum contract for `TAG_NAME_CHAR_CLASS`: it is the inner
 * contents of a regex character class (no flags, no anchors), and a regex
 * built from it accepts/rejects the documented script families.
 */
import { describe, it, expect } from "vitest";

import { TAG_NAME_CHAR_CLASS } from "./tagCharacterClass.js";

describe("TAG_NAME_CHAR_CLASS", () => {
  it("contains no character-class brackets so callers can wrap it in `[...]`", () => {
    // 完成した `[...]` ではなく中身だけを公開するという契約を固定する。
    // Lock the "inner contents only" contract so wrappers stay correct.
    expect(TAG_NAME_CHAR_CLASS.startsWith("[")).toBe(false);
    expect(TAG_NAME_CHAR_CLASS.endsWith("]")).toBe(false);
  });

  it("accepts ASCII letters, digits, underscore, and hyphen", () => {
    const re = new RegExp(`^[${TAG_NAME_CHAR_CLASS}]+$`);
    expect(re.test("Foo_bar-1")).toBe(true);
    expect(re.test("ABCxyz089")).toBe(true);
  });

  it("accepts hiragana, katakana, and CJK characters", () => {
    const re = new RegExp(`^[${TAG_NAME_CHAR_CLASS}]+$`);
    // ひらがな・カタカナ・漢字。
    expect(re.test("ひらがな")).toBe(true);
    expect(re.test("カタカナ")).toBe(true);
    expect(re.test("日本語")).toBe(true);
    expect(re.test("混合Mix日本語")).toBe(true);
  });

  it("rejects whitespace and ASCII punctuation outside the allowed set", () => {
    const re = new RegExp(`^[${TAG_NAME_CHAR_CLASS}]+$`);
    expect(re.test("has space")).toBe(false);
    expect(re.test("dot.notation")).toBe(false);
    expect(re.test("slash/sep")).toBe(false);
    expect(re.test("emoji😀")).toBe(false);
  });
});
