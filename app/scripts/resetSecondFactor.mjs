#!/usr/bin/env node
/**
 * Clears the second factor of a user who lost every method, after the admin has checked who
 * they are (docs/secondFactorRecovery.md). Shows the account, asks for the address again, runs
 * the deletes as one file (D1 rolls the whole file back if it fails) and shows the account again.
 * すべての確認方法を失った人の 2 段階目を消す。本人の確認は先に済ませる（docs/secondFactorRecovery.ja.md）。
 *
 *   node scripts/resetSecondFactor.mjs --email user@example.com --remote --env production
 *   node scripts/resetSecondFactor.mjs --email user@example.com --local [--persist-to DIR]
 *
 * `--dry-run` only shows the account and the SQL that would run.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  inspectSql,
  normalizeEmail,
  resetStatements,
} from "../src/worker/secondFactor/adminReset.ts";

const root = join(import.meta.dirname, "..");
const USAGE = `Usage:
  node scripts/resetSecondFactor.mjs --email <address> --remote [--env production] [--dry-run]
  node scripts/resetSecondFactor.mjs --email <address> --local [--persist-to <dir>] [--dry-run]`;

/** Stops with a usage error. */
function fail(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    remote: { type: "boolean", default: false },
    local: { type: "boolean", default: false },
    env: { type: "string" },
    "persist-to": { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
if (!values.email) fail("--email is required.");
if (values.remote === values.local) fail("Choose exactly one of --remote and --local.");
if (values["persist-to"] && !values.local) fail("--persist-to only works with --local.");

let email = "";
try {
  email = normalizeEmail(values.email);
} catch (error) {
  fail(error.message);
}

const target = [
  values.remote ? "--remote" : "--local",
  ...(values.env ? ["--env", values.env] : []),
  ...(values["persist-to"] ? ["--persist-to", values["persist-to"]] : []),
];

/** Runs `wrangler d1 execute DB` against the chosen database. */
const d1 = (args, stdio) =>
  execFileSync("bunx", ["wrangler", "d1", "execute", "DB", ...target, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio,
  });

/** The account's row from `inspectSql`, or null when no user has the address. */
function inspect() {
  const out = d1(["--json", "--command", inspectSql(email)], ["ignore", "pipe", "inherit"]);
  const [result] = JSON.parse(out);
  return result?.results?.[0] ?? null;
}

/** One line per fact about the account. */
const describe = (row) =>
  [
    `  user id:             ${row.id}`,
    `  address:             ${row.email}`,
    `  signed up:           ${new Date(row.created_at).toISOString()}`,
    `  passkeys:            ${row.passkeys}`,
    `  authenticator app:   ${row.authenticator_app ? "yes" : "no"}`,
    `  recovery codes left: ${row.recovery_codes_left}`,
    `  sessions:            ${row.sessions}`,
  ].join("\n");

const before = inspect();
if (!before) {
  console.error(`No user has the address ${email}. Nothing changed.`);
  process.exit(1);
}
console.log(`The account (${values.remote ? "remote" : "local"} D1):\n${describe(before)}`);

const statements = resetStatements(email);
if (values["dry-run"]) {
  console.log(`\nSQL that would run, in one transaction:\n${statements.join("\n")}`);
  process.exit(0);
}

const prompt = createInterface({ input: process.stdin, output: process.stdout });
const typed = await prompt.question(
  `\nThis removes every passkey, authenticator app, recovery code and session of ${email}.\n` +
    "The account and its notes stay. Type the address again to go on: ",
);
prompt.close();
if (typed.trim().toLowerCase() !== email) {
  console.error("The address did not match. Nothing changed.");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "zedi-reset-"));
try {
  const file = join(dir, "reset.sql");
  writeFileSync(file, `${statements.join("\n")}\n`);
  d1(["--file", file, "--yes"], "inherit");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const after = inspect();
console.log(`\nThe account now:\n${after ? describe(after) : "  (not found)"}`);
if (
  !after ||
  after.passkeys ||
  after.authenticator_app ||
  after.recovery_codes_left ||
  after.sessions
) {
  console.error("\nSomething is left. Check the account before telling the user.");
  process.exit(1);
}
console.log(
  "\nDone. Ask the user to sign in with Google now: they register a new method and save the new\n" +
    "recovery codes. Sessions that were open end within five minutes (the session cookie cache).",
);
