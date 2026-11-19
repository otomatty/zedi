/**
 * Mutation results use unit tests only. The workerd integration runner cannot
 * evaluate any mutants, even with coverage analysis disabled.
 * scripts/mutation/targets.mjs defines the targets. A full run takes about
 * 10 minutes on four cores (2026-11-19). Scores are informational (Issue #1159).
 *
 * 判定には単体テストだけを使う。workerd の統合テストではカバレッジ分析を
 * 無効にしてもミュータントを判定できない。
 * 対象は scripts/mutation/targets.mjs が決める。全体は 4 コアで約 10 分
 * （2026-11-19）。スコアでは実行を失敗させない（Issue #1159）。
 */
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isMutationTarget } from "./scripts/mutation/targets.mjs";

const app = fileURLToPath(new URL("./", import.meta.url));
const src = join(app, "src");
const mutate = readdirSync(src, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(app, join(entry.parentPath, entry.name)).split(sep).join("/"))
  .filter(isMutationTarget)
  .sort();

const reporters = ["clear-text", "progress", "json"];
if (["1", "true"].includes(process.env.STRYKER_HTML_REPORT)) {
  reporters.push("html");
}

export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  mutate,
  tempDirName: ".stryker-tmp",
  reporters,
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  thresholds: { high: 85, low: 75, break: null },
};
