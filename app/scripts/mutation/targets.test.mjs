import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INTEGRATION_ONLY,
  TYPE_ONLY,
  isMutationTarget,
  selectChangedTargets,
  selectSkippedIntegrationOnly,
} from "./targets.mjs";

function hasRuntimeCode(source) {
  const runtimeDeclaration =
    /^[ \t]*(?:export[ \t]+)?(?:async[ \t]+|abstract[ \t]+)?(?:const|let|var|function|class|enum)\b/m;
  const runtimeExport = /^[ \t]*(?:export\b(?:[ \t]+default\b|[ \t]*[={*])|module\.exports\b)/m;
  const commentsOrStrings =
    /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g;
  const code = source.replace(commentsOrStrings, (token) => token.replace(/[^\r\n]/g, "~"));
  return runtimeDeclaration.test(code) || runtimeExport.test(code);
}

// Runtime code detection / 実行時コードの検出
describe("hasRuntimeCode", () => {
  it.each([
    "export type X = string",
    "export interface A {}",
    'import type { A } from "./a"',
    'export type { A } from "./a"',
    'export type * from "./a"',
    "// export const x = 1",
    "/*\n  export const x = 1\n*/",
    'type X = "export default {}"',
  ])("allows %j", (source) => {
    expect(hasRuntimeCode(source)).toBe(false);
  });

  it.each([
    "export const x = 1",
    "  export default {}",
    "export = value",
    "export { a }",
    'export * from "./a"',
    "module.exports = {}",
    "enum E {}",
  ])("rejects %j", (source) => {
    expect(hasRuntimeCode(source)).toBe(true);
  });
});

// Mutation target rules / Mutation の対象判定
describe("isMutationTarget", () => {
  it.each(["src/client/lib/outbox.ts", "src/client/ui/SearchPalette.tsx"])(
    "includes %s",
    (path) => {
      expect(isMutationTarget(path)).toBe(true);
    },
  );

  it.each([
    "src/client/lib/outbox.test.ts",
    "src/client/ui/SearchPalette.test.tsx",
    "src/worker/integration/pages.worker.test.ts",
    "src/worker/wranglerConfig.node.test.ts",
    "src/worker/integration/helpers.ts",
    "src/worker/integration/env.d.ts",
    "src/client/env.d.ts",
    "src/worker/app.tsx",
    "scripts/smoke.mjs",
    "vitest.config.ts",
    "src/client/styles.css",
  ])("excludes %s", (path) => {
    expect(isMutationTarget(path)).toBe(false);
  });

  it("excludes the type-only shared definitions", () => {
    expect(isMutationTarget("src/shared/types.ts")).toBe(false);
  });
});

// Selection from Git paths / Git のパスからの抽出
describe("changed file selection", () => {
  const changed = [
    "app/src/worker/services/pages.ts",
    "src/lib/dateUtils.ts",
    "admin/src/x.ts",
    "README.md",
    "app-old/src/a.ts",
    "app/src/client/ui/SearchPalette.tsx",
    "app/src/worker/app.tsx",
    "app/src/client/lib/outbox.test.ts",
    "app/src/client/lib/outbox.ts",
    "app/src/client/ui/SearchPalette.tsx",
    "app/src/worker/services/pages.ts",
    "src/worker/app.tsx",
  ];

  it("returns unique app-relative mutation targets in ascending order", () => {
    expect(selectChangedTargets(changed)).toEqual([
      "src/client/lib/outbox.ts",
      "src/client/ui/SearchPalette.tsx",
    ]);
  });

  it("returns only changed paths from the integration-only list", () => {
    expect(selectSkippedIntegrationOnly(changed)).toEqual([
      "src/worker/app.tsx",
      "src/worker/services/pages.ts",
    ]);
  });

  it("returns empty lists when there are no applicable changes", () => {
    expect(selectChangedTargets(["README.md"])).toEqual([]);
    expect(selectSkippedIntegrationOnly(["README.md"])).toEqual([]);
  });

  it("returns no mutation targets when only the shared types changed", () => {
    expect(selectChangedTargets(["app/src/shared/types.ts"])).toEqual([]);
  });
});

// Integration-only list integrity / 対象外一覧の整合性
describe("INTEGRATION_ONLY", () => {
  it("contains unique paths to TypeScript source under src/", () => {
    expect(new Set(INTEGRATION_ONLY).size).toBe(INTEGRATION_ONLY.length);
    for (const path of INTEGRATION_ONLY) {
      expect(path).toMatch(/^src\/.+\.tsx?$/);
    }
  });

  it("contains only paths that exist relative to app/", () => {
    for (const path of INTEGRATION_ONLY) {
      expect(existsSync(new URL(`../../${path}`, import.meta.url)), path).toBe(true);
    }
  });
});

// Type-only list integrity / 型専用ファイル一覧の整合性
describe("TYPE_ONLY", () => {
  it("contains unique paths to .ts files under src/", () => {
    expect(new Set(TYPE_ONLY).size).toBe(TYPE_ONLY.length);
    for (const path of TYPE_ONLY) {
      expect(path).toMatch(/^src\/.+\.ts$/);
    }
  });

  it("contains only paths that exist relative to app/", () => {
    for (const path of TYPE_ONLY) {
      expect(existsSync(new URL(`../../${path}`, import.meta.url)), path).toBe(true);
    }
  });

  it("contains no runtime declarations", () => {
    for (const path of TYPE_ONLY) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
      expect(
        hasRuntimeCode(source),
        `Remove ${path} from TYPE_ONLY if it contains runtime code`,
      ).toBe(false);
    }
  });
});
