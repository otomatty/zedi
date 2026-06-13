/**
 * `setup-agent-mirrors.mjs` のユニットテスト。
 * Unit tests for `setup-agent-mirrors.mjs`.
 *
 * 実行 / Run:
 *   node --test scripts/setup-agent-mirrors.test.mjs
 */

import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AgentMirrorSetupError,
  detectLegacyMirrorDirs,
  formatLegacyMigrationMessage,
  isCorrectLink,
  linkAgentMirrors,
  removeIfExists,
} from "./setup-agent-mirrors.mjs";

/** @type {string[]} */
const tempDirs = [];

const canCreateSymlinks = process.platform !== "win32";

/**
 * @returns {string}
 */
function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zedi-agent-mirror-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, ".agents", "skills"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".agents", "agents"), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("detectLegacyMirrorDirs", () => {
  it("returns non-empty real directories that block mirror creation", () => {
    const repoRoot = makeTempRepo();
    const legacyDir = path.join(repoRoot, ".claude", "skills");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "SKILL.md"), "legacy");

    assert.deepEqual(detectLegacyMirrorDirs(repoRoot), [".claude/skills"]);
  });

  it("ignores existing symlinks and empty directories", { skip: !canCreateSymlinks }, () => {
    const repoRoot = makeTempRepo();
    const target = path.join(repoRoot, ".agents", "skills");
    const mirror = path.join(repoRoot, ".cursor", "skills");
    fs.mkdirSync(path.dirname(mirror), { recursive: true });
    fs.symlinkSync(target, mirror, "dir");
    fs.mkdirSync(path.join(repoRoot, ".claude", "agents"), { recursive: true });

    assert.deepEqual(detectLegacyMirrorDirs(repoRoot), []);
  });
});

describe("formatLegacyMigrationMessage", () => {
  it("lists legacy paths and re-run instructions", () => {
    const message = formatLegacyMigrationMessage([".claude/skills", ".cursor/agents"]);
    assert.match(message, /\.claude\/skills/);
    assert.match(message, /bun run setup:agent-mirrors/);
  });
});

describe("removeIfExists", () => {
  it("removes an empty directory", () => {
    const repoRoot = makeTempRepo();
    const emptyDir = path.join(repoRoot, ".cursor", "skills");
    fs.mkdirSync(emptyDir, { recursive: true });

    removeIfExists(emptyDir);
    assert.equal(fs.existsSync(emptyDir), false);
  });

  it("throws AgentMirrorSetupError for a non-empty real directory", () => {
    const repoRoot = makeTempRepo();
    const dir = path.join(repoRoot, ".claude", "skills");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "keep.txt"), "x");

    assert.throws(() => removeIfExists(dir), AgentMirrorSetupError);
  });

  it("removes a broken symlink", { skip: !canCreateSymlinks }, () => {
    const repoRoot = makeTempRepo();
    const mirror = path.join(repoRoot, ".cursor", "skills");
    fs.mkdirSync(path.dirname(mirror), { recursive: true });
    fs.symlinkSync(path.join(repoRoot, "missing-target"), mirror, "dir");

    removeIfExists(mirror);
    assert.equal(fs.existsSync(mirror), false);
  });
});

describe("isCorrectLink", () => {
  it(
    "returns true when a symlink points at the expected target",
    { skip: !canCreateSymlinks },
    () => {
      const repoRoot = makeTempRepo();
      const target = path.join(repoRoot, ".agents", "skills");
      const mirror = path.join(repoRoot, ".cursor", "skills");
      fs.mkdirSync(path.dirname(mirror), { recursive: true });
      fs.symlinkSync(target, mirror, "dir");

      assert.equal(isCorrectLink(mirror, target), true);
    },
  );

  it("returns false for a real directory", () => {
    const repoRoot = makeTempRepo();
    const target = path.join(repoRoot, ".agents", "skills");
    const mirror = path.join(repoRoot, ".cursor", "skills");
    fs.mkdirSync(mirror, { recursive: true });

    assert.equal(isCorrectLink(mirror, target), false);
  });
});

describe("linkAgentMirrors", () => {
  it("throws before creating mirrors when legacy directories exist", () => {
    const repoRoot = makeTempRepo();
    const legacyDir = path.join(repoRoot, ".claude", "skills");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "SKILL.md"), "legacy");

    assert.throws(
      () => linkAgentMirrors(repoRoot),
      (err) => {
        assert.ok(err instanceof AgentMirrorSetupError);
        assert.deepEqual(err.legacyPaths, [".claude/skills"]);
        return true;
      },
    );
  });

  it("creates symlinks for all mirror paths on Unix", { skip: !canCreateSymlinks }, () => {
    const repoRoot = makeTempRepo();

    linkAgentMirrors(repoRoot);

    for (const { mirror, target } of [
      { mirror: ".claude/skills", target: ".agents/skills" },
      { mirror: ".claude/agents", target: ".agents/agents" },
      { mirror: ".cursor/skills", target: ".agents/skills" },
      { mirror: ".cursor/agents", target: ".agents/agents" },
    ]) {
      const mirrorAbs = path.join(repoRoot, mirror);
      const targetAbs = path.join(repoRoot, target);
      assert.equal(isCorrectLink(mirrorAbs, targetAbs), true);
    }
  });

  it("is idempotent when links already exist", { skip: !canCreateSymlinks }, () => {
    const repoRoot = makeTempRepo();

    linkAgentMirrors(repoRoot);
    linkAgentMirrors(repoRoot);

    const mirrorAbs = path.join(repoRoot, ".cursor", "skills");
    const targetAbs = path.join(repoRoot, ".agents", "skills");
    assert.equal(isCorrectLink(mirrorAbs, targetAbs), true);
  });
});
