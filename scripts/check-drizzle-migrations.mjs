#!/usr/bin/env node
/**
 * Drizzle スキーマ変更とマイグレーションファイルの整合性チェッカー。
 * Drizzle schema/migration consistency checker.
 *
 * 目的 / Purpose:
 *   PR #728 のように `server/api/src/schema/**` の TS スキーマだけを変更し、
 *   対応する `server/api/drizzle/*.sql` のマイグレーションを忘れる事故を防ぐ。
 *   そうすると本番 DB がスキーマに追いつかず、500 エラーで露見する。
 *
 *   Catch the failure mode where a contributor edits the Drizzle TS schema
 *   under `server/api/src/schema/**` without committing a matching migration
 *   in `server/api/drizzle/*.sql`. Without this guard, production runs against
 *   a DB that lags the application schema (#728 hit exactly this).
 *
 * 仕組み / How it works:
 *   - 比較ベースを決める（環境変数 `DRIZZLE_DIFF_BASE` または既定で `origin/develop`）。
 *   - `git diff --name-only --diff-filter=ADMR <base>...HEAD` でスキーマ変更を抽出。
 *     - 変更ファイル: `server/api/src/schema/**`
 *     - ただしテスト (`*.test.ts` / `__tests__/`) と純粋な型ファイル (`types/`) は除外。
 *   - 同じ diff で新規追加された `server/api/drizzle/*.sql` または
 *     `server/api/drizzle/meta/_journal.json` の変更が両方あるか確認する。
 *   - スキーマ変更があるのにマイグレーションが追加されていなければ exit 1。
 *
 *   Compute the diff between HEAD and the configured base (default
 *   `origin/develop`). If any `server/api/src/schema/**` source file changed
 *   but no new `server/api/drizzle/*.sql` was added (and the journal was not
 *   updated), exit non-zero with an actionable message.
 *
 * 使い方 / Usage:
 *   node scripts/check-drizzle-migrations.mjs
 *   DRIZZLE_DIFF_BASE=origin/main node scripts/check-drizzle-migrations.mjs
 *
 * False positive を出した場合の救済 / Escape hatch:
 *   コメントだけ・JSDoc だけのスキーマ TS 変更や、CHECK 制約に影響しない型の
 *   別名導入など「DB に当てる必要がない」差分の場合は、PR メッセージに
 *   `[skip drizzle-check]` を含めるか、コミットメッセージに同じ文字列を
 *   含めることで許容できる（環境変数
 *   `DRIZZLE_SKIP_MARKER` でも可）。
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCHEMA_PREFIX = "server/api/src/schema/";
const MIGRATION_PREFIX = "server/api/drizzle/";
const MIGRATION_JOURNAL = "server/api/drizzle/meta/_journal.json";

/**
 * 既定の比較ベース。develop ブランチへの PR を主用途とするので origin/develop を既定にする。
 * ローカル実行時は STR DRIZZLE_DIFF_BASE で上書きできる。
 */
const DEFAULT_BASE = process.env.DRIZZLE_DIFF_BASE || "origin/develop";

/** SKIP マーカー（PR / コミットメッセージ）。 */
const SKIP_MARKER = process.env.DRIZZLE_SKIP_MARKER || "[skip drizzle-check]";

/**
 * @param {readonly string[]} args
 * @returns {string}
 */
function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", cwd: root });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "(no stderr)";
    throw new Error(`git ${args.join(" ")} failed (exit ${result.status}): ${stderr}`);
  }
  return result.stdout || "";
}

/**
 * リモート参照が存在するか確認する。
 * Pull request CI では base が解決できない場合に fail fast する。
 */
function ensureBaseExists(base) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", base], {
    encoding: "utf8",
    cwd: root,
  });
  return result.status === 0;
}

/**
 * @param {string} base
 * @returns {string[]}
 */
function changedPaths(base) {
  const out = git(["diff", "--name-only", "--diff-filter=ADMR", `${base}...HEAD`]);
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} base
 * @returns {string[]}
 */
function addedPaths(base) {
  const out = git(["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`]);
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} path
 */
function isRelevantSchemaChange(path) {
  if (!path.startsWith(SCHEMA_PREFIX)) return false;
  if (path.endsWith(".test.ts")) return false;
  if (path.includes("/__tests__/")) return false;
  if (path.includes("/types/")) return false;
  return path.endsWith(".ts");
}

/**
 * 新規マイグレーション SQL が追加され、かつ journal も更新されたか。
 * Whether both a new migration SQL was added AND the journal was modified.
 *
 * @param {string[]} added
 * @param {string[]} changed
 */
function hasMigrationUpdate(added, changed) {
  const newSql = added.some(
    (p) => p.startsWith(MIGRATION_PREFIX) && p.endsWith(".sql") && !p.includes("/meta/"),
  );
  const journalUpdated = changed.includes(MIGRATION_JOURNAL);
  return newSql && journalUpdated;
}

/**
 * @param {string} base
 * @returns {boolean}
 */
function hasSkipMarker(base) {
  const log = git(["log", `${base}..HEAD`, "--pretty=%B"]);
  if (log.includes(SKIP_MARKER)) return true;
  const prTitle = process.env.PR_TITLE || "";
  const prBody = process.env.PR_BODY || "";
  return prTitle.includes(SKIP_MARKER) || prBody.includes(SKIP_MARKER);
}

function main() {
  const base = DEFAULT_BASE;

  if (!ensureBaseExists(base)) {
    if (process.env.CI === "true") {
      console.error(
        `[check-drizzle-migrations] base ref "${base}" not found. Ensure actions/checkout uses fetch-depth: 0 or fetch the PR base branch before running this check.`,
      );
      process.exit(1);
    }

    console.log(
      `[check-drizzle-migrations] base ref "${base}" not found; skipping check (most likely running outside PR context).`,
    );
    return;
  }

  const changed = changedPaths(base);
  const added = addedPaths(base);

  const schemaChanges = changed.filter(isRelevantSchemaChange);
  if (schemaChanges.length === 0) {
    console.log("[check-drizzle-migrations] no schema changes detected; OK.");
    return;
  }

  if (hasMigrationUpdate(added, changed)) {
    console.log(
      "[check-drizzle-migrations] schema changes detected and matching drizzle migration was added; OK.",
    );
    return;
  }

  if (hasSkipMarker(base)) {
    console.log(
      `[check-drizzle-migrations] schema changes detected but "${SKIP_MARKER}" present; skipping.`,
    );
    return;
  }

  console.error("[check-drizzle-migrations] FAIL");
  console.error("");
  console.error("Drizzle schema files were modified but no migration was added:");
  for (const f of schemaChanges) console.error(`  - ${f}`);
  console.error("");
  console.error(`Expected: at least one new "${MIGRATION_PREFIX}NNNN_*.sql" file`);
  console.error(`          AND an updated "${MIGRATION_JOURNAL}" entry.`);
  console.error("");
  console.error("How to fix / 修正方法:");
  console.error("  1. cd server/api && bunx drizzle-kit generate --name <change-name>");
  console.error("     （DB 接続が必要な場合は DATABASE_URL を一時的にダミー値で渡す）");
  console.error("  2. 生成された SQL を確認し、必要なら backfill を追記する。");
  console.error("  3. drizzle-kit が自動生成するスナップショットが大きすぎる場合は、");
  console.error("     既存の手書きマイグレーションスタイル（0017_add_link_type.sql 等）に合わせて");
  console.error("     diff を最小化した SQL を手書きし、_journal.json も手で追記する。");
  console.error("");
  console.error(`If this change truly does not require a DB migration (e.g. JSDoc-only),`);
  console.error(`include "${SKIP_MARKER}" in a commit message or the PR body.`);
  process.exit(1);
}

main();
