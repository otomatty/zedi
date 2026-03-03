import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** プロジェクトルートの .env.production を読み込み process.env にマージする */
function loadEnvProduction() {
  const root = resolve(process.cwd(), "..", "..");
  const envPath = resolve(root, ".env.production");
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
loadEnvProduction();

/**
 * Railway の TCP Proxy (proxy.rlwy.net) への外部接続では SSL が必須。
 * URL に sslmode が未指定の場合に付加する。
 */
function ensureSslForRailway(url: string): string {
  if (!url || !url.includes("proxy.rlwy.net")) return url;
  try {
    const u = new URL(url);
    if (u.searchParams.has("sslmode")) return url;
    u.searchParams.set("sslmode", "require");
    return u.toString();
  } catch {
    return url;
  }
}

const rawUrl = process.env.DATABASE_URL ?? "";
const url = ensureSslForRailway(rawUrl);

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
