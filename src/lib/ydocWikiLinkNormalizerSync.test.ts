/**
 * `server/api/src/services/ydocWikiLinkNormalizer.ts` と
 * `server/hocuspocus/src/ydocWikiLinkNormalizer.ts` のロジック本体（中央領域）
 * がバイト等価でドリフトしていないことを CI で保証するテスト。
 *
 * 両ファイルは独立した Bun build context (Railway) に置かれているため、
 * `import` で共有することができない（`server/api` も `server/hocuspocus` も
 * ルート Bun workspace の外側）。本テストはクライアント側 vitest から
 * `fs.readFileSync` で両者を読み、ロジック本体（先頭の docblock を除いた
 * 範囲）を文字列等価で比較する。一方を書き換えたらもう一方も同じ手で
 * 更新すること。
 *
 * Drift detector that fails CI when the api-side and hocuspocus-side copies
 * of `ydocWikiLinkNormalizer.ts` diverge. The two files live in separate
 * Bun build contexts (Railway) so neither can import the other; this test
 * reads them from disk and compares the post-header (logic) region.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

/**
 * 先頭の docblock（`/** ... *\/`）と直後の空行を取り除き、ロジック本体だけを
 * 取り出す。各ファイルで docblock 表現は変わってよいが、それ以降は一致して
 * いなければならない。
 *
 * Strip the leading docblock (license / file overview) so logic is compared
 * but headers are allowed to differ. The first `*\/` followed by whitespace
 * is the boundary.
 */
function stripLeadingDocblock(source: string): string {
  // 最初の `/**` から最初の `*/` までを取り除く。直後の改行・空行も除去する。
  // Drop the first `/** ... */` block and any leading blank lines that follow.
  const match = source.match(/^\s*\/\*\*[\s\S]*?\*\/\s*/);
  if (!match) return source;
  return source.slice(match[0].length);
}

describe("ydocWikiLinkNormalizer sync between api and hocuspocus", () => {
  it("logic body matches byte-for-byte between the two copies", () => {
    const apiPath = resolve(REPO_ROOT, "server/api/src/services/ydocWikiLinkNormalizer.ts");
    const hocuspocusPath = resolve(REPO_ROOT, "server/hocuspocus/src/ydocWikiLinkNormalizer.ts");
    const apiSource = readFileSync(apiPath, "utf8");
    const hocuspocusSource = readFileSync(hocuspocusPath, "utf8");

    const apiBody = stripLeadingDocblock(apiSource);
    const hocuspocusBody = stripLeadingDocblock(hocuspocusSource);

    expect(apiBody).toBe(hocuspocusBody);
  });
});
