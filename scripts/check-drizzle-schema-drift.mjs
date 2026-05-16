#!/usr/bin/env node
/**
 * Drizzle スキーマと migration SQL の「既存ドリフト」検出スクリプト。
 * Detect pre-existing drift between Drizzle TS schema and checked-in migrations.
 *
 * 背景 / Background:
 *   `scripts/check-drizzle-migrations.mjs` は、同じ PR 内で
 *   `server/api/src/schema/**` を変更したのに `server/api/drizzle/*.sql` を
 *   追加し忘れた場合を検出する。一方で、過去にすでに schema だけがマージ
 *   されていて migration がリポジトリに無いままになっているケース（例:
 *   `page_snapshots` が `server/api/src/schema/pageSnapshots.ts` には
 *   定義されていたが `server/api/drizzle/*.sql` に CREATE TABLE が無く、
 *   develop Railway で `relation "page_snapshots" does not exist` が出た）は
 *   検出できなかった。
 *
 *   このスクリプトはリポジトリ全体を見て、`pgTable("table_name", ...)` で
 *   定義されている全テーブルが少なくとも 1 つの migration SQL の
 *   `CREATE TABLE` に登場するか（かつ後で `DROP TABLE` されていないか）を
 *   検査する。
 *
 *   `scripts/check-drizzle-migrations.mjs` covers the "edit-without-migrate"
 *   case inside a single PR. It cannot catch tables whose schema landed on
 *   `main` long ago without ever shipping a migration — exactly the
 *   `page_snapshots` failure mode on develop Railway. This script audits the
 *   repo as a whole: every `pgTable("<name>", ...)` must appear as
 *   `CREATE TABLE "<name>"` in at least one migration and must not have been
 *   subsequently `DROP TABLE`d.
 *
 * 使い方 / Usage:
 *   node scripts/check-drizzle-schema-drift.mjs
 *
 * 範囲 / Scope:
 *   - schema 抽出は `pgTable("...", ...)` / `pgTable(\n  "...", ...)` のみ。
 *     `relations()` / `view` などは対象外。
 *   - migration 抽出は `CREATE TABLE [IF NOT EXISTS] "..."` と
 *     `DROP TABLE [IF EXISTS] "..."`。`bytea`, `jsonb` 等の生 SQL や
 *     `ALTER TABLE` は対象外。
 *
 *   The check is intentionally narrow: only `pgTable("name", ...)` calls in
 *   schema files and `CREATE TABLE` / `DROP TABLE` statements in migration
 *   SQL. Raw SQL elsewhere (Hocuspocus, API services) is out of scope for the
 *   first iteration — see Issue #878 for the follow-up.
 *
 * 既存ドリフトの allowlist / Pre-existing drift allowlist:
 *   `note_invitations` のように、本スクリプトを導入した時点ですでに drift
 *   していたテーブルは `ALLOWLIST` に明示する。allowlist に入れる場合は
 *   追跡 issue / 修正方針をコメントで残すこと。
 *
 *   Tables that are already drifted at the time this guard ships go in
 *   `ALLOWLIST`. Always leave a tracking issue / remediation note alongside
 *   each entry.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

/**
 * Schema TS ファイル群のルート（相対パス）。
 * Root of the Drizzle TS schema files.
 */
export const SCHEMA_DIR = "server/api/src/schema";

/**
 * Migration SQL ファイル群のルート（相対パス）。
 * Root of the Drizzle migration SQL files.
 */
export const MIGRATION_DIR = "server/api/drizzle";

/**
 * `pgTable("name", ...)` の抽出パターン。改行や空白を許容する。
 * Match `pgTable("name", ...)` allowing whitespace and newlines before the
 * first string argument.
 */
const PG_TABLE_PATTERN = /\bpgTable\s*\(\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']/g;

/**
 * `CREATE TABLE [IF NOT EXISTS] "name"` の抽出パターン。
 * Match `CREATE TABLE [IF NOT EXISTS] "name"`.
 */
const CREATE_TABLE_PATTERN = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;

/**
 * `DROP TABLE [IF EXISTS] "name"` の抽出パターン。
 * Match `DROP TABLE [IF EXISTS] "name"`.
 */
const DROP_TABLE_PATTERN = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi;

/**
 * 既知の既存ドリフト。スクリプト導入時点で schema と migration が乖離していた
 * テーブルを列挙する。新規 PR で追加する場合は必ず追跡 issue を併記する。
 *
 * Known pre-existing drift. Each entry must come with a tracking issue or
 * remediation plan so the list stays small and reviewable.
 *
 * - `note_invitations`: `server/api/src/schema/notes.ts` で定義されているが、
 *   `server/api/drizzle/*.sql` のどこにも CREATE TABLE が無い。本ガード
 *   導入と同じ PR で migration を追加するのは scope 外のため、別 issue で
 *   フォローアップする想定で一時的に許容する。
 *
 *   `note_invitations` is referenced by the API (invite flow / member resend)
 *   but never created by a checked-in migration. Tracked as follow-up to
 *   Issue #878; remove this allowlist entry once the migration lands.
 */
export const ALLOWLIST = new Set(["note_invitations"]);

/**
 * Schema ファイルの内容から `pgTable("name", ...)` のテーブル名を抽出する。
 * Extract table names declared via `pgTable("name", ...)` from one schema file.
 *
 * @param {string} content - schema TS ファイルのテキスト / schema file text.
 * @returns {string[]} 抽出されたテーブル名（重複排除済み） / unique table names.
 */
export function extractSchemaTables(content) {
  const found = new Set();
  for (const match of content.matchAll(PG_TABLE_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Migration SQL の `CREATE TABLE [IF NOT EXISTS] "name"` を抽出する。
 * Extract table names created in one migration SQL file.
 *
 * @param {string} content - migration SQL ファイルのテキスト / SQL text.
 * @returns {string[]} 抽出されたテーブル名（重複排除済み） / unique table names.
 */
export function extractMigrationCreatedTables(content) {
  const found = new Set();
  for (const match of content.matchAll(CREATE_TABLE_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Migration SQL の `DROP TABLE [IF EXISTS] "name"` を抽出する。
 * Extract table names dropped in one migration SQL file.
 *
 * @param {string} content - migration SQL ファイルのテキスト / SQL text.
 * @returns {string[]} 抽出されたテーブル名（重複排除済み） / unique table names.
 */
export function extractMigrationDroppedTables(content) {
  const found = new Set();
  for (const match of content.matchAll(DROP_TABLE_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Schema にあるが migration に対応する CREATE TABLE が無い（または後で
 * DROP されている）テーブルを列挙する。allowlist に含まれるテーブルは除外する。
 *
 * Compute the set of schema tables that have no live `CREATE TABLE` in the
 * migration history (never created, or created and later dropped). Entries
 * in `allowlist` are excluded so pre-existing drift does not break CI.
 *
 * @param {object} args
 * @param {Set<string>} args.schemaTables - schema 由来のテーブル名集合.
 * @param {Set<string>} args.createdTables - migration の CREATE TABLE 集合.
 * @param {Set<string>} args.droppedTables - migration の DROP TABLE 集合.
 * @param {Set<string>} args.allowlist - 既存ドリフトの許容リスト.
 * @returns {string[]} 修正が必要なテーブル名の昇順配列.
 */
export function findMissingTables({ schemaTables, createdTables, droppedTables, allowlist }) {
  const missing = [];
  for (const name of schemaTables) {
    if (allowlist.has(name)) continue;
    if (!createdTables.has(name)) {
      missing.push(name);
      continue;
    }
    if (droppedTables.has(name)) {
      missing.push(name);
    }
  }
  return missing.sort();
}

/**
 * ディレクトリを再帰的に走査して、指定拡張子のファイルパス（リポジトリ相対）を返す。
 * Recursively list files under `dir` with one of the given extensions.
 *
 * @param {string} dir - リポジトリルートからの相対パス / repo-relative path.
 * @param {readonly string[]} extensions - 対象拡張子 / file extensions to keep.
 * @returns {string[]}
 */
function listFiles(dir, extensions) {
  const absolute = join(REPO_ROOT, dir);
  const result = [];
  for (const entry of readdirSync(absolute)) {
    const fullPath = join(absolute, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...listFiles(relative(REPO_ROOT, fullPath), extensions));
      continue;
    }
    if (extensions.some((ext) => entry.endsWith(ext))) {
      result.push(relative(REPO_ROOT, fullPath));
    }
  }
  return result;
}

/**
 * Schema TS ファイルとして扱うかを判定する。テスト・型ファイル・index は除外する。
 * Filter to "real" schema source files (skip tests, type-only, index, relations).
 *
 * @param {string} relativePath
 */
function isSchemaSourceFile(relativePath) {
  if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".spec.ts")) return false;
  if (relativePath.includes("/__tests__/") || relativePath.includes("/types/")) return false;
  return relativePath.endsWith(".ts");
}

/**
 * Migration SQL として扱うかを判定する。`meta/` 配下のスナップショットは除外する。
 * Filter to migration SQL files (skip the drizzle `meta/` snapshots directory).
 *
 * @param {string} relativePath
 */
function isMigrationSqlFile(relativePath) {
  if (!relativePath.endsWith(".sql")) return false;
  if (relativePath.includes("/meta/")) return false;
  return true;
}

/**
 * リポジトリの schema + migration を読み込み、不足テーブルがあれば exit 1。
 * Scan the repo, fail with a readable message when drift is detected.
 */
function main() {
  const schemaFiles = listFiles(SCHEMA_DIR, [".ts"]).filter(isSchemaSourceFile);
  const migrationFiles = listFiles(MIGRATION_DIR, [".sql"]).filter(isMigrationSqlFile);

  /** @type {Map<string, string[]>} */
  const tableToSchemaFiles = new Map();
  for (const file of schemaFiles) {
    const content = readFileSync(join(REPO_ROOT, file), "utf8");
    for (const table of extractSchemaTables(content)) {
      const list = tableToSchemaFiles.get(table) ?? [];
      list.push(file);
      tableToSchemaFiles.set(table, list);
    }
  }

  const createdTables = new Set();
  const droppedTables = new Set();
  for (const file of migrationFiles) {
    const content = readFileSync(join(REPO_ROOT, file), "utf8");
    for (const t of extractMigrationCreatedTables(content)) createdTables.add(t);
    for (const t of extractMigrationDroppedTables(content)) droppedTables.add(t);
  }

  const schemaTables = new Set(tableToSchemaFiles.keys());
  const missing = findMissingTables({
    schemaTables,
    createdTables,
    droppedTables,
    allowlist: ALLOWLIST,
  });

  if (missing.length === 0) {
    console.log(
      `[check-drizzle-schema-drift] OK — ${schemaTables.size} schema tables are covered by ${createdTables.size} CREATE TABLE statements across ${migrationFiles.length} migration(s).`,
    );
    if (ALLOWLIST.size > 0) {
      console.log(
        `[check-drizzle-schema-drift] (allowlisted pre-existing drift: ${[...ALLOWLIST].join(", ")})`,
      );
    }
    return;
  }

  console.error("[check-drizzle-schema-drift] FAIL");
  console.error("");
  console.error(
    "Drizzle schema defines table(s) with no live migration. Production / develop will throw",
  );
  console.error(`  relation "<table>" does not exist`);
  console.error("at runtime. Each missing table is listed below with its schema file(s):");
  for (const table of missing) {
    const files = tableToSchemaFiles.get(table) ?? [];
    console.error(`  - ${table}  (declared in: ${files.join(", ") || "?"})`);
    if (droppedTables.has(table)) {
      console.error(
        `      note: this table was CREATEd then later DROPped in a migration. Either re-add the CREATE or remove it from the TS schema.`,
      );
    }
  }
  console.error("");
  console.error("How to fix / 修正方法:");
  console.error("  1. Add a `server/api/drizzle/NNNN_*.sql` migration that runs");
  console.error('     `CREATE TABLE IF NOT EXISTS "<table>" (...)` (mirror the TS schema).');
  console.error("  2. Append the matching entry to `server/api/drizzle/meta/_journal.json`.");
  console.error("  3. (If truly intentional pre-existing drift) add the table name to");
  console.error("     `ALLOWLIST` in `scripts/check-drizzle-schema-drift.mjs` with a");
  console.error("     tracking issue link.");
  process.exit(1);
}

// CLI entrypoint — node が直接このファイルを起動した場合のみ main() を走らせる。
// Run main() only when this file is invoked as a CLI, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
