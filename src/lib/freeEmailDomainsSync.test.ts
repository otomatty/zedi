/**
 * `@zedi/shared/freeEmailDomains` と、`server/api` 側で同じ値を二重定義している
 * `server/api/src/lib/freeEmailDomains.ts` がドリフトしていないことを CI で
 * 保証するテスト。`server/api` はルートの Bun workspace から意図的に外れて
 * いるため `@zedi/shared` を直接 import できないので、本テストがサーバ側の
 * ファイルを `fs.readFileSync` で読み、`FREE_EMAIL_DOMAINS` セットと
 * `DOMAIN_REGEX` パターンが両側で完全に一致することを検証する。
 *
 * Drift detector that fails CI when `@zedi/shared`'s `FREE_EMAIL_DOMAINS` /
 * `DOMAIN_REGEX` and the server-side duplicates in
 * `server/api/src/lib/freeEmailDomains.ts` disagree. `server/api` lives
 * outside the Bun workspace (Railway uses `server/api/` as the build
 * context), so it cannot import `@zedi/shared`. This test reads the server
 * file from disk and compares the canonical values byte-for-byte.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import { DOMAIN_REGEX, FREE_EMAIL_DOMAINS } from "@zedi/shared/freeEmailDomains";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * サーバーソース内の `FREE_EMAIL_DOMAINS = new Set([...])` 配列リテラルから
 * 各エントリの文字列だけを順に取り出す。文字列リテラルはダブルクォート前提
 * （プロジェクト全体の Prettier 設定）。テンプレートリテラル化したい場合は
 * 本テストも拡張する。
 *
 * Extract the string entries inside `FREE_EMAIL_DOMAINS = new Set([...])`
 * from the server source. Assumes double-quoted string literals (matches
 * Prettier defaults); extend if the file ever switches to template literals.
 */
function parseServerDomainSet(source: string): string[] {
  const arrayMatch = source.match(
    /export const FREE_EMAIL_DOMAINS\b[^=]*=\s*new Set(?:<[^>]*>)?\(\s*\[([\s\S]*?)\]\s*\)/,
  );
  expect(
    arrayMatch,
    "FREE_EMAIL_DOMAINS export not found in server/api/src/lib/freeEmailDomains.ts",
  ).not.toBeNull();
  if (!arrayMatch) return [];
  const body = arrayMatch[1];
  const entries: string[] = [];
  const stringLiteral = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = stringLiteral.exec(body)) !== null) {
    entries.push(JSON.parse(`"${m[1]}"`) as string);
  }
  return entries;
}

/**
 * サーバ側 `DOMAIN_REGEX` のソース文字列を取り出す。`new RegExp(...)` 形式は
 * 想定していない（プロジェクトのコードは正規表現リテラルで書かれている）。
 *
 * Extract the source of the server-side `DOMAIN_REGEX` literal. We assume the
 * regex-literal form used everywhere else in the codebase, not `new RegExp(...)`.
 */
function parseServerDomainRegex(source: string): string | null {
  const match = source.match(/const DOMAIN_REGEX\s*=\s*\/(.+?)\/[a-z]*\s*;/);
  return match?.[1] ?? null;
}

describe("FREE_EMAIL_DOMAINS / DOMAIN_REGEX sync between @zedi/shared and server/api", () => {
  const serverFilePath = resolve(__dirname, "../../server/api/src/lib/freeEmailDomains.ts");
  const source = readFileSync(serverFilePath, "utf8");

  it("server/api/src/lib/freeEmailDomains.ts mirrors the shared FREE_EMAIL_DOMAINS set", () => {
    const serverEntries = parseServerDomainSet(source);
    expect(new Set(serverEntries)).toEqual(FREE_EMAIL_DOMAINS);
    // 二重登録が無いこと（パース上のドリフトを防ぐ）/ guard against duplicates.
    expect(serverEntries).toHaveLength(new Set(serverEntries).size);
  });

  it("server/api/src/lib/freeEmailDomains.ts mirrors the shared DOMAIN_REGEX pattern", () => {
    const serverPattern = parseServerDomainRegex(source);
    expect(serverPattern, "DOMAIN_REGEX literal not found in server file").not.toBeNull();
    expect(serverPattern).toBe(DOMAIN_REGEX.source);
  });
});
