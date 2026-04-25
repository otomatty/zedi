import { describe, expect, it } from "vitest";
import { parseStdioArgsLine } from "./parseStdioArgs";

describe("parseStdioArgsLine", () => {
  describe("basic splitting", () => {
    it("splits on whitespace", () => {
      expect(parseStdioArgsLine("a b c")).toEqual(["a", "b", "c"]);
    });

    it("collapses consecutive whitespace into a single split (no empty tokens)", () => {
      // 連続する空白は 1 つの境界として扱われ、空トークンは生まれない。
      // Pin that runs of whitespace produce no empty tokens — kills mutations
      // that flip the regex `+` to `*`.
      expect(parseStdioArgsLine("a    b\t  c")).toEqual(["a", "b", "c"]);
    });

    it("returns an empty array for an empty string", () => {
      // `if (!trimmed) return []` の早期 return を検証する。
      // Pin the early-return on empty input.
      expect(parseStdioArgsLine("")).toEqual([]);
    });

    it("returns an empty array for whitespace-only input", () => {
      // `args.trim()` が効くこと。
      // Pin the trim() guard so a removal mutation surfaces here.
      expect(parseStdioArgsLine("   \t\n  ")).toEqual([]);
    });

    it("trims leading and trailing whitespace before tokenizing", () => {
      // 前後の空白を剥がしてからトークナイズする。
      // Pin trim() vs returning leading/trailing empty tokens.
      expect(parseStdioArgsLine("  a b  ")).toEqual(["a", "b"]);
    });
  });

  describe("double-quoted segments", () => {
    it("preserves quoted segments with spaces (Windows path)", () => {
      expect(parseStdioArgsLine('--path "C:\\Program Files\\foo"')).toEqual([
        "--path",
        "C:\\Program Files\\foo",
      ]);
    });

    it("strips outer double quotes from a single token", () => {
      expect(parseStdioArgsLine('"one two" three')).toEqual(["one two", "three"]);
    });

    it("unescapes backslash-escaped double quotes inside the segment", () => {
      // `\"` → `"`。`replace(/\\"/g, '"')` のロジックを直接的に検証する。
      // Pin the inner-quote unescape; without this test the replace can be deleted
      // and the surviving mutant goes undetected.
      // 入力: "say \"hi\" please" → say "hi" please
      const input = String.raw`"say \"hi\" please"`;
      expect(parseStdioArgsLine(input)).toEqual([`say "hi" please`]);
    });

    it("unescapes backslash-escaped backslashes inside the segment", () => {
      // `\\` → `\`。`replace(/\\\\/g, "\\")` を検証する。
      // Pin the backslash-unescape; the replace order matters so a swap breaks this.
      // 入力: "a\\b" → a\b
      const input = String.raw`"a\\b"`;
      expect(parseStdioArgsLine(input)).toEqual([String.raw`a\b`]);
    });

    it("treats an empty quoted segment as the empty string token", () => {
      // 空文字 "" は長さ 2 (`""`) なので length >= 2 を満たし、空文字に解釈される。
      // Pin that empty `""` produces an empty string token (length-2 boundary).
      expect(parseStdioArgsLine('""')).toEqual([""]);
    });

    it("preserves single quotes inside a double-quoted segment", () => {
      // 二重引用内の単一引用はそのまま残る（unescape 対象は \" と \\ のみ）。
      // Kills mutations to the unescape regex that would remove single quotes.
      expect(parseStdioArgsLine(`"it's fine"`)).toEqual(["it's fine"]);
    });
  });

  describe("single-quoted segments", () => {
    it("handles single-quoted segments with embedded spaces", () => {
      expect(parseStdioArgsLine("--x '/my path/file'")).toEqual(["--x", "/my path/file"]);
    });

    it("does NOT process backslash escapes inside single quotes (literal preserved)", () => {
      // 単一引用内ではバックスラッシュエスケープを解釈しない（literal）。
      // Pin the asymmetry between single and double quotes; without this test a
      // mutation that adds replace() to the single-quote branch survives.
      const input = String.raw`'a\nb'`;
      expect(parseStdioArgsLine(input)).toEqual([String.raw`a\nb`]);
    });

    it("treats an empty single-quoted segment as the empty string token", () => {
      expect(parseStdioArgsLine("''")).toEqual([""]);
    });

    it("preserves double quotes inside a single-quoted segment", () => {
      expect(parseStdioArgsLine(`'say "hi"'`)).toEqual([`say "hi"`]);
    });
  });

  describe("mixed and adjacent segments", () => {
    it("returns multi-token strings in input order", () => {
      // 並び順を厳密に検証する（map/filter の順序逆転変異を殺す）。
      // Pin token order so a `.reverse()` mutation surfaces here.
      expect(parseStdioArgsLine("--a one --b two")).toEqual(["--a", "one", "--b", "two"]);
    });

    it("concatenates adjacent quoted/unquoted parts into a single raw token (regex `+`)", () => {
      // 正規表現末尾の `+` により隣接した引用・非引用が 1 トークンに結合される。
      // 結合後トークンは `"` で始まらないため slice/unescape 経路を通らず、引用記号がそのまま残る。
      // Pin the concat semantic: a single token comes back, and because it
      // doesn't begin with `"`, the slice/unescape branch is bypassed (quotes preserved).
      expect(parseStdioArgsLine(`pre"mid"post`)).toEqual([`pre"mid"post`]);
    });

    it("returns an unquoted token verbatim (no slice/no replace)", () => {
      // 非引用トークンには slice/replace を適用しない経路を検証する。
      // Pin the third branch (return t verbatim) so removing it shifts to slicing.
      expect(parseStdioArgsLine("plain")).toEqual(["plain"]);
    });
  });
});
