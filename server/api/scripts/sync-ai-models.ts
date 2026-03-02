/**
 * AI モデル一覧を各プロバイダーから取得し、DB の ai_models を更新する。
 *
 * 必要な環境変数:
 *   DATABASE_URL         必須
 *   OPENAI_API_KEY       任意（未設定なら OpenAI はスキップ）
 *   ANTHROPIC_API_KEY    任意（未設定なら Anthropic はスキップ）
 *   GOOGLE_AI_API_KEY    任意（未設定なら Google はスキップ）
 *
 * 実行例:
 *   cd server/api && npm run sync:ai-models
 *   （プロジェクトルートの .env を自動読み込み。またはシェルで上記を設定して実行）
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getDb } from "../src/db/client.js";
import { syncAiModels } from "../src/services/syncAiModels.js";

/** プロジェクトルートの .env を読み込み process.env にマージする（未設定のキーのみ） */
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

async function main() {
  loadEnvFromRoot();
  console.log("Syncing AI models from providers...");
  const db = getDb();
  const results = await syncAiModels(db);
  const hardErrors: string[] = [];
  for (const r of results) {
    if (r.error) {
      console.warn(`  ${r.provider}: ${r.error}`);
      if (!r.error.endsWith(" not set")) {
        hardErrors.push(`${r.provider}: ${r.error}`);
      }
    } else {
      console.log(`  ${r.provider}: fetched ${r.fetched}, upserted ${r.upserted}`);
    }
  }
  if (hardErrors.length > 0) {
    console.error("Sync completed with provider errors:", hardErrors);
    process.exit(1);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
