/**
 * Stryker configuration for frontend mutation testing.
 * フロントエンド向け mutation testing の設定。
 *
 * - JSON report: `reports/mutation/mutation.json` — input for `mutation:report:summary` (compact Markdown for AI).
 * - HTML report: optional; set `STRYKER_HTML_REPORT=0` to skip (faster, smaller disk; use JSON + Markdown summary for AI).
 * - JSON レポート: `mutation:report:summary` の入力。HTML は `STRYKER_HTML_REPORT=0` で省略可能（AI 向けは要約 MD を利用）。
 *
 * ## CI 失敗時の原因分類 / Failure triage (Issue #1050)
 *
 * 1. **timeout** — `ERROR DryRunExecutor Initial test run timed out!`、job が数分で終了。
 *    dry run（全テスト実行）が `dryRunTimeoutMinutes` を超過。テストスイート肥大化が原因なら値を引き上げる。
 * 2. **score** — `Final mutation score X under breaking threshold Y`、全 mutant 実行後（nightly 全量で 2.5h 程度）に exit 1。
 *    レポートは生成済み（artifact / Job Summary で確認可）。nightly は `stryker.config.nightly.mjs`（`break: null`）で観測のみ。
 * 3. **test error** — dry run 中のテスト失敗。mutation 以前の問題なので先に `vitest run` を直す。
 *
 * ## Mutate 候補の優先度 / Priority for golden-list expansion (`ci.yml` mutation-light)
 *
 * | 優先度 | 基準 | 例 |
 * |--------|------|----|
 * | critical | PR golden list 採用済み（スコア 85%+ で安定） | dateUtils, encryption, aiCostUtils, mcpServerImportHelpers, noteViewHelpers, aiChatConversationTitle, onboardingState, useContainerColumns |
 * | high | 次の追加候補（nightly で 85%+ の lib ユーティリティ） | aiClient, resolveServerModel, noteSharingRisk, mergeAbortSignals, wikiGeneratorUtils, createStorageAdapter |
 * | medium | テスト強化後に検討（60〜85% の lib / hooks） | contentUtils, tagUtils, markdownToTiptap, wikiLinkUtils, src/hooks/** |
 */
const htmlReporterDisabled = new Set(["0", "false", "off", "no", "disabled"]);
const htmlReporterFlag = (process.env.STRYKER_HTML_REPORT ?? "").toLowerCase();
const htmlReporterEnabled = !htmlReporterDisabled.has(htmlReporterFlag);

export default {
  testRunner: "vitest",
  tempDirName: ".stryker-tmp",
  mutate: [
    "src/lib/**/*.{ts,tsx}",
    "src/hooks/**/*.{ts,tsx}",
    "src/pages/NoteView/noteViewHelpers.ts",
    "src/components/layout/AppLayout.tsx",
    "src/pages/NoteView/index.tsx",
    "src/pages/NoteSettings/index.tsx",
    "src/components/layout/Header/index.tsx",
    "!src/**/*.test.{ts,tsx}",
    "!src/test/**",
    "!src/main.tsx",
    "!src/vite-env.d.ts",
    // Sentry init is thin glue (SDK bootstrap + no-op when DSN unset); mutation value is low.
    // Sentry 初期化は薄いグルーコード（DSN 未設定時 no-op）のため mutate 対象外。
    "!src/lib/sentry.ts",
  ],
  vitest: {
    configFile: "vite.config.ts",
  },
  // Dry run = 全テスト 1 周。CI ではスイート肥大化により既定の 5 分を超過するため延長（Issue #1050）。
  dryRunTimeoutMinutes: 20,
  reporters: ["clear-text", "progress", "json", ...(htmlReporterEnabled ? ["html"] : [])],
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  htmlReporter: {
    fileName: "reports/mutation/mutation.html",
  },
  // Thresholds raised 2026-03-21 — remediation: fix surviving mutants in targeted tests
  thresholds: {
    high: 85,
    low: 75,
    break: 70,
  },
};
