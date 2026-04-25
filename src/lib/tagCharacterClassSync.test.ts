/**
 * `@zedi/shared` の `TAG_NAME_CHAR_CLASS` と、`server/api` 側で同じ文字列を
 * 二重定義している `TAG_NAME_CHAR_CLASS_STRING` がドリフトしていないことを
 * CI で保証するテスト。
 *
 * `server/api` はルートの Bun workspace から意図的に外れており（Railway は
 * `server/api/` 自体を build context にする）、`@zedi/shared` を直接 import
 * することができない。そのためサーバ側にも同一文字列を持たせ、本テストが
 * クライアント側の vitest で両者の一致を検証する。文字クラスを更新する際は
 * `packages/shared/src/tagCharacterClass.ts` と
 * `server/api/src/services/ydocRenameRewrite.ts` を必ず同時に書き換える。
 *
 * Drift detector that fails CI when `@zedi/shared`'s `TAG_NAME_CHAR_CLASS`
 * and the server-side duplicate `TAG_NAME_CHAR_CLASS_STRING` in
 * `server/api/src/services/ydocRenameRewrite.ts` disagree. `server/api`
 * intentionally lives outside the Bun workspace (Railway uses `server/api/`
 * as the build context), so it cannot import `@zedi/shared`. This test reads
 * the server file from disk and compares the literal value against the
 * source-of-truth constant.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import { TAG_NAME_CHAR_CLASS } from "@zedi/shared/tagCharacterClass";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("TAG_NAME_CHAR_CLASS sync between @zedi/shared and server/api", () => {
  it("server/api/src/services/ydocRenameRewrite.ts mirrors the shared constant", () => {
    const serverFilePath = resolve(__dirname, "../../server/api/src/services/ydocRenameRewrite.ts");
    const source = readFileSync(serverFilePath, "utf8");

    // 抽出パターンは `export const TAG_NAME_CHAR_CLASS_STRING = "..."` の
    // 値部分を取り出す。文字列リテラルはダブルクォート前提（プロジェクト
    // 全体の Prettier 設定）。テンプレートリテラル化したい場合は本テストも
    // 拡張する。
    // Extract the literal value of `export const TAG_NAME_CHAR_CLASS_STRING`.
    // Uses a double-quoted string literal (matches Prettier defaults). If the
    // server file ever switches to a template literal, extend this regex.
    const match = source.match(
      /export const TAG_NAME_CHAR_CLASS_STRING\s*=\s*"((?:[^"\\]|\\.)*)";?/,
    );

    expect(match, "TAG_NAME_CHAR_CLASS_STRING export not found in server file").not.toBeNull();
    if (!match) return;

    // ソース内のエスケープシーケンス（`\\-` 等）を実値に解決して比較する。
    // JSON.parse でデコードできるようにダブルクォートを再付与する。
    // Decode JS-escape sequences (`\\-` etc.) so the comparison is between
    // semantic string values, not raw source bytes.
    const literalValue = JSON.parse(`"${match[1]}"`) as string;
    expect(literalValue).toBe(TAG_NAME_CHAR_CLASS);
  });
});
