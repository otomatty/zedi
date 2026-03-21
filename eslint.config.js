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
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
          },
          contexts: [
            "TSTypeAliasDeclaration",
            "TSInterfaceDeclaration",
            "TSEnumDeclaration",
            "VariableDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": ["warn", { descriptionStyle: "body" }],
      "jsdoc/no-blank-block-descriptions": "error",
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
