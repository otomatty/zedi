#!/usr/bin/env node
/**
 * Create .claude/* and .cursor/* mirrors pointing at .agents/ (canonical).
 * Windows: directory junctions. Unix: symlinks.
 *
 * Run from repo root: bun run setup:agent-mirrors
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

/** @type {{ mirror: string; target: string }[]} */
const links = [
  { mirror: ".claude/skills", target: ".agents/skills" },
  { mirror: ".claude/agents", target: ".agents/agents" },
  { mirror: ".cursor/skills", target: ".agents/skills" },
  { mirror: ".cursor/agents", target: ".agents/agents" },
];

/**
 * @param {string} p
 */
function removeIfExists(p) {
  if (!fs.existsSync(p)) return;
  const stat = fs.lstatSync(p);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    const entries = fs.readdirSync(p);
    if (entries.length > 0) {
      throw new Error(
        `${p} exists and is not empty. Move contents to .agents/ or delete manually, then re-run.`,
      );
    }
    fs.rmdirSync(p);
  } else {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

/**
 * @param {string} mirrorRel
 * @param {string} targetRel
 */
function createLink(mirrorRel, targetRel) {
  const mirrorAbs = path.join(repoRoot, mirrorRel);
  const targetAbs = path.join(repoRoot, targetRel);

  if (!fs.existsSync(targetAbs)) {
    throw new Error(`Target missing: ${targetRel}`);
  }

  fs.mkdirSync(path.dirname(mirrorAbs), { recursive: true });
  removeIfExists(mirrorAbs);

  if (isWindows) {
    execFileSync("cmd.exe", ["/c", "mklink", "/J", mirrorAbs, targetAbs], {
      stdio: "inherit",
    });
  } else {
    fs.symlinkSync(targetAbs, mirrorAbs, "dir");
  }

  console.log(`Linked ${mirrorRel} → ${targetRel}`);
}

for (const { mirror, target } of links) {
  createLink(mirror, target);
}

console.log("Agent mirrors ready.");
