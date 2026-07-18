/**
 * Specification tests for `parseWorkerEnvFile` / `serializeWorkerEnvFile`.
 *
 * Accepted syntax: `KEY=VALUE`, optional `export` prefix, `#` comments, blank lines skipped,
 * empty values skipped, quoted values unwrapped. Invalid lines (no `=`, bad key) throw.
 *
 * `parseWorkerEnvFile` / `serializeWorkerEnvFile` の仕様テスト。
 * 受理: `KEY=VALUE`、`export` 接頭辞、`#` コメント、空行スキップ、空値スキップ、引用符除去。
 * 拒否: `=` なし行・不正キーは例外。
 */
import { describe, expect, it } from "vitest";
import { parseWorkerEnvFile, serializeWorkerEnvFile } from "./parseWorkerEnvFile.js";

describe("parseWorkerEnvFile", () => {
  it("parses KEY=VALUE pairs and skips comments and blanks", () => {
    const text = `
# comment
STORAGE_ENDPOINT=https://example.r2.cloudflarestorage.com

STORAGE_BUCKET_NAME=zedi-storage-dev
export STORAGE_ACCESS_KEY=akid
STORAGE_SECRET_KEY="secret with spaces"
EMPTY_SKIP=
`;
    expect(parseWorkerEnvFile(text)).toEqual([
      { name: "STORAGE_ENDPOINT", value: "https://example.r2.cloudflarestorage.com" },
      { name: "STORAGE_BUCKET_NAME", value: "zedi-storage-dev" },
      { name: "STORAGE_ACCESS_KEY", value: "akid" },
      { name: "STORAGE_SECRET_KEY", value: "secret with spaces" },
    ]);
  });

  it("rejects lines without KEY=VALUE", () => {
    expect(() => parseWorkerEnvFile("NOT_A_PAIR")).toThrow(/invalid/i);
  });
});

describe("serializeWorkerEnvFile", () => {
  it("quotes values with whitespace for wrangler secret bulk", () => {
    const body = serializeWorkerEnvFile([
      { name: "STORAGE_ACCESS_KEY", value: "akid" },
      { name: "STORAGE_SECRET_KEY", value: "secret with spaces" },
    ]);
    expect(body).toBe('STORAGE_ACCESS_KEY=akid\nSTORAGE_SECRET_KEY="secret with spaces"');
  });
});
