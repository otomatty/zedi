/**
 * Fixture-driven tests for the Claude analysis output schema. Issue #806.
 *
 * 実行方法 / How to run:
 *   `node --test .github/actions/claude-analyze/__tests__/schema.test.mjs`
 *
 * vitest を新たに追加するのは workspace の test:run が肥大化するので、
 * Node 24 の組み込みテストランナーを使う。CI への組み込みは README 参照。
 *
 * Uses Node 24's built-in test runner instead of adding a new vitest workspace
 * — keeps the action self-contained and avoids touching the monorepo's
 * `test:run` aggregator. CI wiring guidance lives in the action README.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  analysisOutputSchema,
  parseAndValidate,
  SEVERITIES,
  suspectedFileSchema,
} from "../schema.mjs";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

/**
 * @param {string} name
 * @returns {Promise<string>}
 */
async function loadFixtureRaw(name) {
  return readFile(path.join(FIXTURES, name), "utf8");
}

test("SEVERITIES matches the server-side ApiErrorSeverity enum", () => {
  assert.deepEqual([...SEVERITIES], ["high", "medium", "low", "unknown"]);
});

test("valid-high.json passes the schema and round-trips through parseAndValidate", async () => {
  const raw = await loadFixtureRaw("valid-high.json");
  const parsed = JSON.parse(raw);
  assert.equal(analysisOutputSchema.safeParse(parsed).success, true);
  const validated = parseAndValidate(raw);
  assert.equal(validated.severity, "high");
  assert.equal(Array.isArray(validated.ai_suspected_files), true);
  assert.equal(validated.ai_suspected_files?.length, 2);
  assert.equal(validated.ai_suspected_files?.[0]?.path.includes("0042_add_note_id"), true);
});

test("valid-low-nulls.json accepts explicit nulls for optional fields", async () => {
  const raw = await loadFixtureRaw("valid-low-nulls.json");
  const validated = parseAndValidate(raw);
  assert.equal(validated.severity, "low");
  assert.equal(validated.ai_root_cause, null);
  assert.equal(validated.ai_suggested_fix, null);
  assert.equal(validated.ai_suspected_files, null);
});

test("invalid-bad-severity.json is rejected with a severity-mention message", async () => {
  const raw = await loadFixtureRaw("invalid-bad-severity.json");
  assert.throws(() => parseAndValidate(raw), /severity/i);
});

test("invalid-missing-summary.json is rejected when ai_summary is absent", async () => {
  const raw = await loadFixtureRaw("invalid-missing-summary.json");
  assert.throws(() => parseAndValidate(raw), /ai_summary/);
});

test("invalid-suspected-file.json is rejected when an entry has no path", async () => {
  const raw = await loadFixtureRaw("invalid-suspected-file.json");
  assert.throws(() => parseAndValidate(raw), /path/);
});

test("parseAndValidate strips Claude's ```json``` fence and prose preamble", () => {
  const wrapped = [
    "Sure, here is the analysis:",
    "```json",
    JSON.stringify({
      severity: "medium",
      ai_summary: "wrapped in fence",
      ai_root_cause: null,
      ai_suggested_fix: null,
      ai_suspected_files: null,
    }),
    "```",
  ].join("\n");
  const validated = parseAndValidate(wrapped);
  assert.equal(validated.severity, "medium");
  assert.equal(validated.ai_summary, "wrapped in fence");
});

test("parseAndValidate throws when no JSON object is present", () => {
  assert.throws(() => parseAndValidate("nope, no braces here"), /JSON object/);
});

test("parseAndValidate throws on empty input", () => {
  assert.throws(() => parseAndValidate(""), /empty/);
});

test("suspectedFileSchema requires a non-empty path", () => {
  assert.equal(suspectedFileSchema.safeParse({ path: "" }).success, false);
  assert.equal(suspectedFileSchema.safeParse({ path: "src/foo.ts" }).success, true);
});

test("suspectedFileSchema rejects non-integer line numbers", () => {
  assert.equal(suspectedFileSchema.safeParse({ path: "src/foo.ts", line: 12.5 }).success, false);
  assert.equal(suspectedFileSchema.safeParse({ path: "src/foo.ts", line: 12 }).success, true);
});

test("analysisOutputSchema rejects unknown top-level keys (strict mode)", () => {
  const bad = {
    severity: "low",
    ai_summary: "ok",
    extra_field: "should not be here",
  };
  assert.equal(analysisOutputSchema.safeParse(bad).success, false);
});
