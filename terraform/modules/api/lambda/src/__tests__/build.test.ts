/**
 * ビルド検証テスト — esbuild 出力の品質チェック
 *
 * Phase 0-C: esbuild バンドル統一 + Node.js 22 ランタイム更新
 * @see https://github.com/otomatty/zedi/issues/65
 */
import { describe, it, expect } from "vitest";
import { existsSync, statSync, readFileSync } from "fs";
import { resolve } from "path";

const distDir = resolve(__dirname, "../../dist");

describe("esbuild output", () => {
  it("dist/index.mjs が生成される", () => {
    expect(existsSync(resolve(distDir, "index.mjs"))).toBe(true);
  });

  it("バンドルサイズが 1MB 未満", () => {
    const stat = statSync(resolve(distDir, "index.mjs"));
    expect(stat.size).toBeLessThan(1_000_000); // 1MB
  });

  it("sourcemap が生成される", () => {
    expect(existsSync(resolve(distDir, "index.mjs.map"))).toBe(true);
  });

  it("@aws-sdk がバンドルに含まれていない（external 指定）", () => {
    const content = readFileSync(resolve(distDir, "index.mjs"), "utf8");
    // external 指定により import from "@aws-sdk/..." 文は残るが、
    // SDK の実装コード（例: クラス定義）はバンドルに含まれない。
    // SDK 実装の特徴的なコード片が存在しないことで確認する。
    expect(content).not.toContain("SdkError");
    expect(content).not.toContain("ClientDefaults");
    expect(content).not.toContain("resolveClientEndpointParameters");
  });
});

describe("Node.js 22 互換性", () => {
  it("handler が正常に export される", async () => {
    const content = readFileSync(resolve(distDir, "index.mjs"), "utf8");
    // ESM export が存在することを確認（実際のインポートは AWS SDK 依存のためスキップ）
    expect(content).toContain("handler");
  });

  it("ESM フォーマットで出力されている", () => {
    const content = readFileSync(resolve(distDir, "index.mjs"), "utf8");
    // ESM の import/export 文が含まれていることを確認
    expect(content).toContain("import");
  });
});
