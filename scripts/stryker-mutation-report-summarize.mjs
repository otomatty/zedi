#!/usr/bin/env node
/**
 * Build a compact Markdown summary from `reports/mutation/mutation.json` for AI review.
 * `mutation.html` は巨大なためチャットに含めない；本スクリプトの出力を `@` 添付する。
 *
 * Usage:
 *   node scripts/stryker-mutation-report-summarize.mjs
 *   node scripts/stryker-mutation-report-summarize.mjs path/to/mutation.json
 *   node scripts/stryker-mutation-report-summarize.mjs --stdout-only
 *
 * Flags:
 *   --stdout-only  Print Markdown to stdout only (no file write). Low token footprint for AI chat.
 *   --help, -h     Show usage.
 *
 * Environment:
 *   STRYKER_SUMMARY_MAX_SURVIVED — max survived mutants listed (default 80)
 *   STRYKER_SUMMARY_OUT — output path (default reports/mutation/mutation-summary.md)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaultInput = resolve(root, "reports/mutation/mutation.json");
const defaultOut =
  process.env.STRYKER_SUMMARY_OUT?.trim() || resolve(root, "reports/mutation/mutation-summary.md");
const maxSurvived = Math.max(
  1,
  Number.parseInt(process.env.STRYKER_SUMMARY_MAX_SURVIVED ?? "80", 10) || 80,
);

/**
 * @param {string[]} argv
 * @returns {{ input: string; out: string; stdoutOnly: boolean }}
 */
function parseArgs(argv) {
  let stdoutOnly = false;
  let input = defaultInput;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      console.log(`stryker-mutation-report-summarize — compact Markdown from mutation.json (AI-friendly, not HTML)

Usage:
  bun run mutation:report:summary
  bun run mutation:report:summary -- --stdout-only
  node scripts/stryker-mutation-report-summarize.mjs [path/to/mutation.json]

Environment:
  STRYKER_SUMMARY_OUT, STRYKER_SUMMARY_MAX_SURVIVED

See also: stryker.config.mjs (jsonReporter), STRYKER_HTML_REPORT=0 to skip HTML.`);
      process.exit(0);
    }
    if (a === "--stdout-only") {
      stdoutOnly = true;
      continue;
    }
    if (a.startsWith("-")) {
      console.error(`stryker-mutation-report-summarize: unknown flag ${a} (try --help)`);
      process.exit(1);
    }
    positional.push(a);
  }
  if (positional[0]) {
    input = resolve(positional[0]);
  }
  return { input, out: defaultOut, stdoutOnly };
}

/**
 * @param {string} s
 * @param {number} max
 */
function truncate(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * @param {string} status
 * @param {Record<string, number>} acc
 */
function bump(status, acc) {
  acc[status] = (acc[status] ?? 0) + 1;
}

/**
 * @param {Record<string, number>} acc
 */
function totalCounted(acc) {
  return Object.values(acc).reduce((a, b) => a + b, 0);
}

/**
 * @param {{ files?: Record<string, { mutants?: Array<{ status: string }> }> }} report
 */
function aggregate(report) {
  /** @type {Record<string, Record<string, number>>} */
  const perFile = {};
  /** @type {Record<string, number>} */
  const global = {};

  for (const [path, file] of Object.entries(report.files ?? {})) {
    perFile[path] = {};
    for (const m of file.mutants ?? []) {
      bump(m.status, perFile[path]);
      bump(m.status, global);
    }
  }

  const killed = global["Killed"] ?? 0;
  const survived = global["Survived"] ?? 0;
  const timeout = global["Timeout"] ?? 0;
  const noCov = global["NoCoverage"] ?? 0;
  const detected = killed + survived + timeout;

  const scoreTotal = totalCounted(global) > 0 ? (100 * killed) / totalCounted(global) : Number.NaN;
  const scoreCovered = detected > 0 ? (100 * killed) / detected : Number.NaN;

  return { perFile, global, killed, survived, timeout, noCov, scoreTotal, scoreCovered };
}

/**
 * @param {{ files?: Record<string, { mutants?: Array<Record<string, unknown>> }> }} report
 * @param {number} limit
 */
function collectSurvived(report, limit) {
  /** @type {Array<{ path: string; m: Record<string, unknown> }>} */
  const out = [];
  outer: for (const [path, file] of Object.entries(report.files ?? {})) {
    for (const m of file.mutants ?? []) {
      if (m.status === "Survived") {
        out.push({ path, m });
        if (out.length >= limit) break outer;
      }
    }
  }
  return out;
}

function main() {
  const { input, out, stdoutOnly } = parseArgs(process.argv.slice(2));
  let raw;
  try {
    raw = readFileSync(input, "utf8");
  } catch {
    console.error(
      `stryker-mutation-report-summarize: cannot read ${input}\n` +
        `  Run mutation tests first (JSON reporter writes this file). Example:\n` +
        `  STRYKER_HTML_REPORT=0 bun run test:mutation:changed -- --dryRunTimeoutMinutes 30`,
    );
    process.exit(1);
  }

  const report = JSON.parse(raw);
  const agg = aggregate(report);
  const survived = collectSurvived(report, maxSurvived);

  const lines = [];
  lines.push("# Stryker mutation summary (compact)");
  lines.push("");
  lines.push("This file is generated for AI review. Do not attach `mutation.html` (too large).");
  lines.push("");
  lines.push(
    "このファイルは AI レビュー用の要約です。`mutation.html` は巨大なため添付しないでください。",
  );
  lines.push("");
  lines.push(`- Source JSON: \`${input}\``);
  lines.push(`- Schema: ${report.schemaVersion ?? "?"}`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Totals / 合計");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("|--------|------:|");
  const order = [
    "Killed",
    "Survived",
    "NoCoverage",
    "Timeout",
    "CompileError",
    "RuntimeError",
    "Ignored",
    "Pending",
  ];
  for (const k of order) {
    const v = agg.global[k];
    if (v !== undefined) lines.push(`| ${k} | ${v} |`);
  }
  lines.push(`| **(all)** | **${totalCounted(agg.global)}** |`);
  lines.push("");

  lines.push("## Scores / スコア（mutants から再計算）");
  lines.push("");
  lines.push(
    `- **% total (killed / all mutants):** ${Number.isNaN(agg.scoreTotal) ? "n/a" : agg.scoreTotal.toFixed(2)}`,
  );
  lines.push(
    `- **% covered (killed / killed+survived+timeout):** ${Number.isNaN(agg.scoreCovered) ? "n/a" : agg.scoreCovered.toFixed(2)}`,
  );
  lines.push("");

  lines.push("## Per-file / ファイル別");
  lines.push("");
  lines.push("| File | Killed | Survived | NoCov | Timeout | Other |");
  lines.push("|------|-------:|---------:|------:|--------:|------:|");
  const paths = Object.keys(agg.perFile).sort();
  for (const p of paths) {
    const c = agg.perFile[p];
    const killed = c["Killed"] ?? 0;
    const surv = c["Survived"] ?? 0;
    const nc = c["NoCoverage"] ?? 0;
    const to = c["Timeout"] ?? 0;
    const other =
      (c["CompileError"] ?? 0) +
      (c["RuntimeError"] ?? 0) +
      (c["Ignored"] ?? 0) +
      (c["Pending"] ?? 0);
    lines.push(`| \`${p}\` | ${killed} | ${surv} | ${nc} | ${to} | ${other} |`);
  }
  lines.push("");

  lines.push(
    `## Survived mutants (priority for stronger tests) / 優先度（最大 ${maxSurvived} 件）`,
  );
  lines.push("");
  if (survived.length === 0) {
    lines.push("(none in sample / なし)");
  } else {
    for (const { path, m } of survived) {
      const loc = /** @type {{ start?: { line?: number; column?: number } }} */ (m.location);
      const line = loc?.start?.line ?? "?";
      const col = loc?.start?.column ?? "?";
      const mutatorName = String(m.mutatorName ?? "");
      const desc = String(m.description ?? mutatorName);
      const replacement = m.replacement != null ? String(m.replacement) : "";
      const repl = replacement
        ? ` — replacement: \`${truncate(replacement.replace(/\s+/g, " "), 100)}\``
        : "";
      lines.push(
        `- **\`${path}\`** L${line}:${col} — [${mutatorName}] ${truncate(desc, 200)}${repl}`,
      );
    }
    if ((agg.global["Survived"] ?? 0) > survived.length) {
      lines.push("");
      lines.push(
        `… and ${(agg.global["Survived"] ?? 0) - survived.length} more survived (increase STRYKER_SUMMARY_MAX_SURVIVED).`,
      );
    }
  }
  lines.push("");

  lines.push("## Notes for AI / AI 向けメモ");
  lines.push("");
  lines.push("- **Survived**: tests did not detect the mutation; add or strengthen assertions.");
  lines.push(
    "- **NoCoverage**: no test mapped to this mutant in this run (common on partial `--mutate`).",
  );
  lines.push(
    "- **Thresholds** in `stryker.config.mjs` apply to full `bun run test:mutation`; diff runs may use `stryker.config.mutation-changed.mjs`.",
  );
  lines.push("");

  const body = lines.join("\n") + "\n";
  if (stdoutOnly) {
    process.stdout.write(body);
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body, "utf8");
  console.error(`stryker-mutation-report-summarize: wrote ${out}`);
}

main();
