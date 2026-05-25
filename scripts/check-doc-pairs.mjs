#!/usr/bin/env node
/**
 * Verifies English/Japanese documentation pairs and required language banners.
 * Run: bun run docs:check-pairs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** @type {{ en: string; ja: string }[]} */
const DOC_PAIRS = [
  { en: "README.md", ja: "README.ja.md" },
  { en: "CONTRIBUTING.md", ja: "CONTRIBUTING.ja.md" },
  { en: "SECURITY.md", ja: "SECURITY.ja.md" },
  { en: "DOCUMENTATION.md", ja: "DOCUMENTATION.ja.md" },
  { en: "extension/README.md", ja: "extension/README.ja.md" },
  { en: "server/mcp/README.md", ja: "server/mcp/README.ja.md" },
  { en: "admin/README.md", ja: "admin/README.ja.md" },
  {
    en: "terraform/cloudflare/README.md",
    ja: "terraform/cloudflare/README.ja.md",
  },
];

const EN_BANNER = /> \*\*Language:\*\* English \|/m;
const JA_BANNER = /> \*\*言語:\*\*/m;

/** @param {string} relPath */
function readDoc(relPath) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) {
    return null;
  }
  return readFileSync(abs, "utf8");
}

/** @param {string[]} errors */
function main() {
  const errors = [];

  for (const { en, ja } of DOC_PAIRS) {
    const enContent = readDoc(en);
    const jaContent = readDoc(ja);

    if (enContent === null) {
      errors.push(`Missing English doc: ${en}`);
      continue;
    }
    if (jaContent === null) {
      errors.push(`Missing Japanese pair: ${ja} (expected pair for ${en})`);
      continue;
    }

    if (!EN_BANNER.test(enContent)) {
      errors.push(`${en}: missing language banner (expected "> **Language:** English | ...")`);
    }
    if (!JA_BANNER.test(jaContent)) {
      errors.push(`${ja}: missing language banner (expected "> **言語:** ...")`);
    }

    const jaBase = ja.split("/").pop() ?? ja;
    if (!enContent.includes(`](${jaBase})`) && !enContent.includes(`](${ja})`)) {
      errors.push(`${en}: banner should link to ${ja}`);
    }

    const enBase = en.split("/").pop() ?? en;
    if (!jaContent.includes(`](${enBase})`) && !jaContent.includes(`](${en})`)) {
      errors.push(`${ja}: banner should link to ${en}`);
    }
  }

  if (errors.length > 0) {
    console.error("Documentation pair check failed:\n");
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log(`OK: ${DOC_PAIRS.length} documentation pairs verified.`);
}

main();
