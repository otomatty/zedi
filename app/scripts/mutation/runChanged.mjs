#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { selectChangedTargets, selectSkippedIntegrationOnly } from "./targets.mjs";

const app = fileURLToPath(new URL("../../", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Read Git paths without quoting or splitting on whitespace.
 * @param {string[]} args
 * @returns {string[]}
 */
function gitPaths(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
    .split("\0")
    .filter(Boolean);
}

const base = process.env.STRYKER_DIFF_BASE?.trim();
const changed = gitPaths([
  "diff",
  "--name-only",
  "-z",
  "--diff-filter=ACMR",
  "--end-of-options",
  base ? `${base}...HEAD` : "HEAD",
  "--",
]);
if (!base) {
  changed.push(...gitPaths(["ls-files", "-z", "--others", "--exclude-standard"]));
}

const args = process.argv.slice(2);
if (args.includes("--list-skipped")) {
  for (const path of selectSkippedIntegrationOnly(changed)) console.log(path);
  process.exit(0);
}

const targets = selectChangedTargets(changed);
if (args.includes("--list")) {
  for (const path of targets) console.log(path);
  process.exit(0);
}

if (targets.length === 0) {
  console.error("runChanged: No changed mutation targets in app/src/.");
  process.exit(0);
}

const cli = fileURLToPath(
  new URL("../../node_modules/@stryker-mutator/core/bin/stryker.js", import.meta.url),
);
const result = spawnSync(process.execPath, [cli, "run", "--mutate", targets.join(","), ...args], {
  cwd: app,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
