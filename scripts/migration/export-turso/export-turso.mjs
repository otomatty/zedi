#!/usr/bin/env node
/**
 * C2-1: Turso 全テーブルエクスポート
 * 使用例: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node export-turso.mjs [--out-dir=./output]
 * または .env.development / .env の VITE_TURSO_* を利用（プロジェクトルートで実行時）
 * 出力: 1 つの JSON ファイル（EXPORT_FORMAT.md の形式）
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** プロジェクトルート（scripts/migration/export-turso の3階層上） */
const projectRoot = join(__dirname, "..", "..", "..");

function loadEnvFile(envPath) {
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch (_) {
    // ignore
  }
}

function loadEnv() {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) return;
  for (const name of [".env.development", ".env"]) {
    loadEnvFile(join(projectRoot, name));
    if (process.env.VITE_TURSO_DATABASE_URL && process.env.VITE_TURSO_AUTH_TOKEN) break;
  }
  process.env.TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL;
  process.env.TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;
}

const TABLES = ["pages", "links", "ghost_links", "notes", "note_pages", "note_members"];

function toPlainValue(value) {
  if (value == null) return null;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof ArrayBuffer || (typeof Uint8Array !== "undefined" && value instanceof Uint8Array)) {
    const buf = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    return Buffer.from(buf).toString("base64");
  }
  return value;
}

function rowsToJson(columns, rows) {
  return rows.map((row) => {
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = toPlainValue(row[i]);
    }
    return obj;
  });
}

function parseArgs() {
  const outDir = process.argv.find((a) => a.startsWith("--out-dir="));
  return { outDir: outDir ? outDir.slice("--out-dir=".length) : null };
}

async function main() {
  loadEnv();
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN");
    process.exit(1);
  }

  const { outDir } = parseArgs();
  const baseDir = outDir ? join(process.cwd(), outDir) : join(__dirname, "output");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `turso-export-${timestamp}.json`;
  const filepath = join(baseDir, filename);

  const client = createClient({ url, authToken });

  const payload = {
    exported_at: new Date().toISOString(),
    source: "turso",
    tables: {},
  };

  for (const table of TABLES) {
    const rs = await client.execute(`SELECT * FROM ${table}`);
    payload.tables[table] = rowsToJson(rs.columns, rs.rows);
    console.log(`${table}: ${payload.tables[table].length} rows`);
  }

  await mkdir(baseDir, { recursive: true });
  await writeFile(filepath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${filepath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
