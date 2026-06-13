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

const isWindows = process.platform === "win32";

/** @type {{ mirror: string; target: string }[]} */
export const AGENT_MIRROR_LINKS = [
  { mirror: ".claude/skills", target: ".agents/skills" },
  { mirror: ".claude/agents", target: ".agents/agents" },
  { mirror: ".cursor/skills", target: ".agents/skills" },
  { mirror: ".cursor/agents", target: ".agents/agents" },
];

/**
 * Thrown when agent mirror setup cannot proceed safely.
 * エージェントミラー設定が安全に進められない場合に投げる。
 */
export class AgentMirrorSetupError extends Error {
  /**
   * @param {string} message
   * @param {{ legacyPaths?: string[] }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "AgentMirrorSetupError";
    this.legacyPaths = options.legacyPaths ?? [];
  }
}

/**
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function detectLegacyMirrorDirs(repoRoot) {
  /** @type {string[]} */
  const legacy = [];

  for (const { mirror } of AGENT_MIRROR_LINKS) {
    const mirrorAbs = path.join(repoRoot, mirror);
    if (!fs.existsSync(mirrorAbs)) continue;

    const stat = fs.lstatSync(mirrorAbs);
    if (stat.isSymbolicLink()) continue;

    if (fs.readdirSync(mirrorAbs).length > 0) {
      legacy.push(mirror);
    }
  }

  return legacy;
}

/**
 * @param {string[]} legacyPaths
 * @returns {string}
 */
export function formatLegacyMigrationMessage(legacyPaths) {
  const listed = legacyPaths.map((p) => `  - ${p}/`).join("\n");
  return [
    "Legacy agent directories found (pre-.agents/ migration):",
    listed,
    "",
    "Canonical content now lives in .agents/ (tracked in git).",
    "Remove the legacy directories, then re-run:",
    "",
    "  rm -rf .claude/skills .claude/agents .cursor/skills .cursor/agents",
    "  bun run setup:agent-mirrors",
    "",
    "See CONTRIBUTING.md — Agent skills migration.",
  ].join("\n");
}

/**
 * @param {string} mirrorAbs
 * @param {string} targetAbs
 * @returns {boolean}
 */
export function isCorrectLink(mirrorAbs, targetAbs) {
  if (!fs.existsSync(mirrorAbs)) return false;

  try {
    const stat = fs.lstatSync(mirrorAbs);
    if (!stat.isSymbolicLink()) return false;

    const linkTarget = fs.readlinkSync(mirrorAbs);
    const resolvedLink = path.resolve(path.dirname(mirrorAbs), linkTarget);
    return resolvedLink === path.resolve(targetAbs);
  } catch {
    return false;
  }
}

/**
 * @param {string} p
 */
export function removeIfExists(p) {
  /** @type {import("node:fs").Stats | undefined} */
  let stat;
  try {
    stat = fs.lstatSync(p);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return;
    }
    throw err;
  }

  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    const entries = fs.readdirSync(p);
    if (entries.length > 0) {
      throw new AgentMirrorSetupError(
        `${p} exists and is not empty. Move contents to .agents/ or delete manually, then re-run.`,
      );
    }
    fs.rmdirSync(p);
    return;
  }

  fs.rmSync(p, { recursive: true, force: true });
}

/**
 * @param {string} mirrorAbs
 * @param {string} targetAbs
 */
function createPlatformLink(mirrorAbs, targetAbs) {
  if (isWindows) {
    execFileSync("cmd.exe", ["/c", "mklink", "/J", mirrorAbs, targetAbs], {
      stdio: "inherit",
    });
    return;
  }

  fs.symlinkSync(targetAbs, mirrorAbs, "dir");
}

/**
 * @param {string} repoRoot
 * @param {string} mirrorRel
 * @param {string} targetRel
 * @returns {"created" | "skipped"}
 */
export function createAgentMirrorLink(repoRoot, mirrorRel, targetRel) {
  const mirrorAbs = path.join(repoRoot, mirrorRel);
  const targetAbs = path.join(repoRoot, targetRel);

  if (!fs.existsSync(targetAbs)) {
    throw new AgentMirrorSetupError(`Target missing: ${targetRel}`);
  }

  if (isCorrectLink(mirrorAbs, targetAbs)) {
    console.log(`Already linked ${mirrorRel} → ${targetRel}`);
    return "skipped";
  }

  fs.mkdirSync(path.dirname(mirrorAbs), { recursive: true });
  removeIfExists(mirrorAbs);
  createPlatformLink(mirrorAbs, targetAbs);
  console.log(`Linked ${mirrorRel} → ${targetRel}`);
  return "created";
}

/**
 * Create or refresh .claude/* and .cursor/* mirrors for repoRoot.
 * repoRoot 向けに .claude/* / .cursor/* ミラーを作成または更新する。
 *
 * @param {string} repoRoot
 */
export function linkAgentMirrors(repoRoot) {
  const legacy = detectLegacyMirrorDirs(repoRoot);
  if (legacy.length > 0) {
    throw new AgentMirrorSetupError(formatLegacyMigrationMessage(legacy), {
      legacyPaths: legacy,
    });
  }

  /** @type {string[]} */
  const createdThisRun = [];

  try {
    for (const { mirror, target } of AGENT_MIRROR_LINKS) {
      const status = createAgentMirrorLink(repoRoot, mirror, target);
      if (status === "created") {
        createdThisRun.push(path.join(repoRoot, mirror));
      }
    }
  } catch (err) {
    for (const mirrorAbs of createdThisRun.reverse()) {
      try {
        fs.rmSync(mirrorAbs, { recursive: true, force: true });
      } catch {
        // Best-effort rollback only.
      }
    }

    if (err instanceof AgentMirrorSetupError) {
      throw err;
    }

    throw new AgentMirrorSetupError(
      err instanceof Error ? err.message : "Failed to create agent mirrors.",
    );
  }
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    linkAgentMirrors(repoRoot);
    console.log("Agent mirrors ready.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create agent mirrors.";
    console.error(`[ERROR] ${message}`);
    process.exit(1);
  }
}
