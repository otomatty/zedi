#!/usr/bin/env node
/**
 * GitHub Actions のワークフローコマンド（例: ::error）へ埋め込む本文をエスケープする。
 * `%` / CR / LF / `:` がそのままだと注釈が壊れたり追加コマンドとして解釚される。
 *
 * Escape text embedded in GitHub Actions workflow commands (e.g. ::error).
 * Raw `%`, CR/LF, and `:` can corrupt annotations or inject extra commands.
 *
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
 */
import fs from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: escapeGithubAnnotation.mjs <file>");
  process.exit(1);
}
const s = fs.readFileSync(path, "utf8");
process.stdout.write(
  s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A"),
);
