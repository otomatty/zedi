import js from "@eslint/js";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tsdoc from "eslint-plugin-tsdoc";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

/**
 * ESLint 設定
 *
 * 方針:
 * - パフォーマンス: 無駄な処理・未使用コードの検出、React Hooks の正しい依存配列
 * - YAGNI・クリーン: 未使用変数/import、debugger 禁止、複雑度・ネスト深度の制限
 * - 可読性: console.log の制限、一貫したスタイル（Prettier と併用）
 */
export default tseslint.config(
  {
    ignores: [
      "dist",
      "dist-ssr",
      "**/dist",
      "node_modules",
      "coverage",
      "playwright-report",
      "test-results",
      ".stryker-tmp",
      "**/.stryker-tmp/**",
      ".claude",
      "src-tauri/target",
      ".wrangler",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.strict],
    files: ["**/*.{ts,tsx}"],
    settings: {
      react: {
        version: "detect",
      },
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      jsdoc,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      tsdoc,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // strict 由来ルール（Phase 2-B: warn → error 化完了）
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-extraneous-class": "error",
      "@typescript-eslint/no-useless-constructor": "error",
      "@typescript-eslint/no-dynamic-delete": "error",

      // --- 未使用コードの削除 (YAGNI) ---
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "unused-imports/no-unused-imports": "warn",

      // --- 本番に残すべきでないもの ---
      "no-debugger": "error",
      "no-console": "off", // 下の override で src のみ有効

      // --- TSDoc / JSDoc（export されたものにコメント必須、現時点は warning のみ） ---
      // 空 JSDoc スタブの自動挿入を防ぐため `enableFixer: false` を指定する。
      // `--fix` で空 description のブロックを生成すると `jsdoc/no-blank-block-descriptions`
      // と矛盾し、レビューでもノイズとして繰り返し指摘されるため、警告のみ残し手動で記述する運用とする。
      // Disable the auto-fixer so `--fix` does not insert empty JSDoc stubs.
      // The auto-inserted blocks conflict with `jsdoc/no-blank-block-descriptions`
      // and were repeatedly flagged as noise during review; we keep the warning
      // but require contributors to write descriptions manually.
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          enableFixer: false,
          require: {
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
          },
          // `publicOnly` は `require` 配下にのみ作用するため、`contexts` 側は明示的に
          // `ExportNamedDeclaration` 配下のセレクタへ絞り、未 export の内部宣言で
          // 警告が出ないようにする。
          // `publicOnly` only filters the `require` targets, so we scope custom
          // contexts to children of `ExportNamedDeclaration` to avoid warning
          // on internal, non-exported declarations.
          contexts: [
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration > TSEnumDeclaration",
            "ExportNamedDeclaration > VariableDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": ["warn", { descriptionStyle: "body" }],
      // `jsdoc/require-jsdoc` が `warn` であるのに、空 description を `error` にすると
      // 「JSDoc を書き始めた人ほどブロックされる」逆インセンティブになるため warn に統一する。
      // Align severity with `jsdoc/require-jsdoc` (`warn`); making blank
      // descriptions `error` would penalise contributors who start writing JSDoc
      // more than those who skip it entirely.
      "jsdoc/no-blank-block-descriptions": "warn",
      "tsdoc/syntax": "warn",

      // --- 可読性・複雑度 ---
      complexity: ["warn", { max: 20 }],
      "max-depth": ["warn", { max: 4 }],
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },
  // アプリ本体ソース: console 制限・行数制限を適用
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/components/**/*.tsx"],
    plugins: {
      react,
    },
    rules: {
      "react/no-multi-comp": "warn",
    },
  },
  // ユーザーメニュー: ドロップダウン／シート／トリガー／コンテンツを 1 ファイルに配置（分割より可読性を優先）
  {
    files: ["src/components/layout/Header/UnifiedMenu.tsx"],
    rules: {
      "react/no-multi-comp": "off",
    },
  },
  // Vitest: multiple mocked child components per file is normal
  {
    files: ["src/components/**/*.test.tsx"],
    rules: {
      "react/no-multi-comp": "off",
    },
  },
  // スクリプト・e2e・サーバー: console 可、行数制限は緩め
  {
    files: ["scripts/**/*.ts", "e2e/**/*.ts", "server/**/*.ts", "terraform/**/*.ts"],
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
      "max-depth": ["warn", { max: 5 }],
    },
  },
);
