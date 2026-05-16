/**
 * `check-drizzle-schema-drift.mjs` のユニットテスト。
 * Unit tests for `check-drizzle-schema-drift.mjs`.
 *
 * 目的 / Purpose:
 *   - schema TS / migration SQL からのテーブル名抽出が、Zedi の実際の書き方
 *     （`pgTable("name", ...)`、`pgTable(\n  "name",\n  ...`、
 *     `CREATE TABLE [IF NOT EXISTS] "name"`、`DROP TABLE [IF EXISTS] "name"`）
 *     を網羅できているかを保証する。
 *   - `pageSnapshots` のように schema にはあるが migration が無いケースが
 *     drift として検出できることをユニットテストで再現する。
 *
 *   Guarantee that the extraction regexes cover the patterns Zedi actually
 *   writes in this repo and that the missing-table detection reproduces the
 *   `page_snapshots` regression we hit on the develop Railway environment.
 *
 * 実行 / Run:
 *   node --test scripts/check-drizzle-schema-drift.test.mjs
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  extractSchemaTables,
  extractMigrationCreatedTables,
  extractMigrationDroppedTables,
  findMissingTables,
} from "./check-drizzle-schema-drift.mjs";

describe("extractSchemaTables", () => {
  it("extracts a table name from a single-line pgTable() call", () => {
    const src = `export const pageContents = pgTable("page_contents", { id: uuid("id") });`;
    assert.deepEqual(extractSchemaTables(src), ["page_contents"]);
  });

  it("extracts a table name from a multi-line pgTable() call", () => {
    const src = [
      "export const pageSnapshots = pgTable(",
      '  "page_snapshots",',
      '  { id: uuid("id") },',
      ");",
    ].join("\n");
    assert.deepEqual(extractSchemaTables(src), ["page_snapshots"]);
  });

  it("extracts multiple tables defined in the same file", () => {
    const src = [
      'export const a = pgTable("a", {});',
      "export const b = pgTable(",
      '  "b",',
      "  {},",
      ");",
      'export const c = pgTable("c", {});',
    ].join("\n");
    assert.deepEqual(extractSchemaTables(src).sort(), ["a", "b", "c"]);
  });

  it("ignores unrelated string literals", () => {
    const src = [
      'const note = "note_invitations"; // not a pgTable call',
      'someOther("not_a_table", {});',
      'export const x = pgTable("real_table", {});',
    ].join("\n");
    assert.deepEqual(extractSchemaTables(src), ["real_table"]);
  });

  it("deduplicates if the same pgTable name appears twice in one file", () => {
    const src = [
      'export const a = pgTable("dup", {});',
      'export const b = pgTable("dup", {});',
    ].join("\n");
    assert.deepEqual(extractSchemaTables(src), ["dup"]);
  });
});

describe("extractMigrationCreatedTables", () => {
  it("extracts a plain CREATE TABLE", () => {
    const sql = `CREATE TABLE "pages" ("id" uuid PRIMARY KEY NOT NULL);`;
    assert.deepEqual(extractMigrationCreatedTables(sql), ["pages"]);
  });

  it("extracts CREATE TABLE IF NOT EXISTS", () => {
    const sql = `CREATE TABLE IF NOT EXISTS "page_snapshots" ("id" uuid);`;
    assert.deepEqual(extractMigrationCreatedTables(sql), ["page_snapshots"]);
  });

  it("ignores DROP TABLE / CREATE INDEX statements", () => {
    const sql = [
      'CREATE TABLE "kept" ("id" uuid);',
      'DROP TABLE IF EXISTS "old";',
      'CREATE INDEX "idx_kept_id" ON "kept" ("id");',
    ].join("\n");
    assert.deepEqual(extractMigrationCreatedTables(sql), ["kept"]);
  });

  it("collects multiple CREATE TABLE statements", () => {
    const sql = [
      'CREATE TABLE "a" ("id" uuid);',
      'CREATE TABLE IF NOT EXISTS "b" ("id" uuid);',
      'CREATE TABLE "c" ("id" uuid);',
    ].join("\n");
    assert.deepEqual(extractMigrationCreatedTables(sql).sort(), ["a", "b", "c"]);
  });
});

describe("extractMigrationDroppedTables", () => {
  it("extracts DROP TABLE IF EXISTS", () => {
    const sql = `DROP TABLE IF EXISTS "note_pages";`;
    assert.deepEqual(extractMigrationDroppedTables(sql), ["note_pages"]);
  });

  it("extracts plain DROP TABLE", () => {
    const sql = `DROP TABLE "obsolete";`;
    assert.deepEqual(extractMigrationDroppedTables(sql), ["obsolete"]);
  });

  it("does not match CREATE TABLE statements", () => {
    const sql = `CREATE TABLE "kept" ("id" uuid);`;
    assert.deepEqual(extractMigrationDroppedTables(sql), []);
  });
});

describe("findMissingTables", () => {
  it("returns nothing when every schema table has a CREATE TABLE", () => {
    const result = findMissingTables({
      schemaTables: new Set(["pages", "notes"]),
      createdTables: new Set(["pages", "notes", "user"]),
      droppedTables: new Set(),
      allowlist: new Set(),
    });
    assert.deepEqual(result, []);
  });

  it("flags a schema table that has no CREATE TABLE — page_snapshots regression", () => {
    // Reproduces the develop Railway failure:
    //   `relation "page_snapshots" does not exist`
    // The schema referenced `page_snapshots` but no migration CREATEd it.
    const result = findMissingTables({
      schemaTables: new Set(["pages", "page_snapshots"]),
      createdTables: new Set(["pages"]),
      droppedTables: new Set(),
      allowlist: new Set(),
    });
    assert.deepEqual(result, ["page_snapshots"]);
  });

  it("flags a schema table that was CREATEd but later DROPped", () => {
    // PR #823 dropped note_pages; if the schema still referenced it, that
    // would be a drift even though a historical CREATE TABLE exists.
    const result = findMissingTables({
      schemaTables: new Set(["note_pages"]),
      createdTables: new Set(["note_pages"]),
      droppedTables: new Set(["note_pages"]),
      allowlist: new Set(),
    });
    assert.deepEqual(result, ["note_pages"]);
  });

  it("does not flag a table that was DROPped and is no longer in the schema", () => {
    const result = findMissingTables({
      schemaTables: new Set(["pages"]),
      createdTables: new Set(["pages", "note_pages"]),
      droppedTables: new Set(["note_pages"]),
      allowlist: new Set(),
    });
    assert.deepEqual(result, []);
  });

  it("respects the allowlist for pre-existing drift", () => {
    const result = findMissingTables({
      schemaTables: new Set(["note_invitations"]),
      createdTables: new Set(),
      droppedTables: new Set(),
      allowlist: new Set(["note_invitations"]),
    });
    assert.deepEqual(result, []);
  });

  it("returns missing tables in deterministic sorted order", () => {
    const result = findMissingTables({
      schemaTables: new Set(["z_table", "a_table", "m_table"]),
      createdTables: new Set(),
      droppedTables: new Set(),
      allowlist: new Set(),
    });
    assert.deepEqual(result, ["a_table", "m_table", "z_table"]);
  });
});
