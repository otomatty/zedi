import type { CoverageV8Options } from "vitest/node";

/** Shared Vitest coverage reporters across workspaces. / 全ワークスペース共通の reporter 設定。 */
export const coverageReporters = ["text", "json", "html"] as const;

/** Standard patterns for test-only files and setup dirs. / テスト専用ファイル・セットアップ用の共通 exclude。 */
export const coverageTestExcludes = [
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
  "**/test/**",
  "**/__tests__/**",
] as const;

/**
 * Frontend `src/types/` entries that are type-only (no runtime logic).
 * Files with helpers or type guards (e.g. `ai.ts`, `storage.ts`) stay in the denominator.
 *
 * 型定義のみの `src/types/` ファイル。関数や型ガードを含むファイルは母数に残す。
 */
export const frontendTypeOnlyExcludes = [
  "src/types/aiChat.ts",
  "src/types/chatPageGeneration.ts",
  "src/types/generalSettings.ts",
  "src/types/mcp.ts",
  "src/types/noteFilterPreferences.ts",
  "src/types/note.ts",
  "src/types/pageSnapshot.ts",
  "src/types/page.ts",
  "src/types/tagFilter.ts",
] as const;

type CreateCoverageConfigOptions = {
  include: string[];
  exclude?: string[];
  reportsDirectory?: string;
};

/**
 * Build a Vitest `coverage` block with shared provider/reporter defaults.
 * 共通の provider / reporter を使った Vitest `coverage` 設定を組み立てる。
 */
export function createCoverageConfig(options: CreateCoverageConfigOptions): CoverageV8Options {
  return {
    provider: "v8",
    reporter: [...coverageReporters],
    include: options.include,
    reportsDirectory: options.reportsDirectory ?? "./coverage",
    exclude: [...coverageTestExcludes, ...(options.exclude ?? [])],
  };
}
