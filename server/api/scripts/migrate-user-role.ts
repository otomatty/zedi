/**
 * user テーブルに role カラムを追加するマイグレーション（0003_add_user_role 相当）
 *
 * 実行: cd server/api && npx tsx scripts/migrate-user-role.ts
 * （プロジェクトルートの .env で DATABASE_URL を設定）
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getPool } from "../src/db/client.js";

function loadEnvFromRoot() {
  const root = resolve(process.cwd(), "..", "..");
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFromRoot();

const sql = `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;`;

async function main() {
  const pool = getPool();
  await pool.query(sql);
  console.log("Migration applied: user.role column added.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
