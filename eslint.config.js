import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
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
      "node_modules",
      "coverage",
      "playwright-report",
      "test-results",
      ".wrangler",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.strict],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // strict 由来ルールの段階的対応（現状は warn、徐々に error へ移行推奨）
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-extraneous-class": "warn",
      "@typescript-eslint/no-useless-constructor": "warn",
      "@typescript-eslint/no-dynamic-delete": "warn",

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
