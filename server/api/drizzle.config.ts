import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "..", "..");

/** プロジェクトルートの .env を読み込み（sync-ai-models 等と同様） */
function loadEnv() {
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

/** .env.production で上書き（ローカルで本番 DB に接続する場合） */
function loadEnvProduction() {
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
    if (key) process.env[key] = value;
  }
}

loadEnv();
loadEnvProduction();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error(
    "DATABASE_URL environment variable is not set. Configure DATABASE_URL in your environment or .env/.env.production before running drizzle-kit.",
  );
}

/** Railway TCP Proxy (proxy.rlwy.net) は自己署名証明書のため、接続時にのみ検証を緩和する。hostname で判定しユーザー名/パスワード内の誤マッチを防ぐ。 */
function isRailwayProxyHost(url: string): boolean {
  const parts = url.split("@");
  if (parts.length < 2) return false;
  const afterAt = parts[parts.length - 1];
  const hostPart = afterAt.split("/")[0];
  const host = hostPart.split(":")[0];
  return host.endsWith(".proxy.rlwy.net");
}

/** Railway 経由時のみ ssl を指定。それ以外は指定しないので DATABASE_URL やドライバのデフォルトに委ねる。 */
const sslOption = isRailwayProxyHost(dbUrl) ? { rejectUnauthorized: false } : undefined;

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ...(sslOption && { ssl: sslOption }),
  },
});
