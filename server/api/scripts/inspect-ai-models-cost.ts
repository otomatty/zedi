/**
 * ai_models テーブルの input_cost_units / output_cost_units を確認する
 *
 * 実行例:
 *   cd server/api && npx tsx scripts/inspect-ai-models-cost.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { eq, asc } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { aiModels } from "../src/schema/index.js";
import { calculateBaseline } from "./inspect-ai-models-cost.lib.js";

function loadEnvFromRoot() {
  const root = resolve(process.cwd(), "..", "..");
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadEnvFromRoot();
  const db = getDb();

  const rows = await db
    .select({
      id: aiModels.id,
      displayName: aiModels.displayName,
      inputCostUnits: aiModels.inputCostUnits,
      outputCostUnits: aiModels.outputCostUnits,
      isActive: aiModels.isActive,
    })
    .from(aiModels)
    .where(eq(aiModels.isActive, true))
    .orderBy(asc(aiModels.sortOrder));

  console.log("\n=== ai_models (is_active=true) ===\n");
  console.log(
    "id".padEnd(35),
    "displayName".padEnd(25),
    "inputCU".padStart(8),
    "outputCU".padStart(8),
    "multiplier(仮)",
  );
  console.log("-".repeat(95));

  // baseline が Infinity になる問題 (#609) を避けるため、計算は `calculateBaseline` に委譲する。
  // Delegate to `calculateBaseline` to avoid the `Infinity` baseline edge case (#609).
  const baseline = calculateBaseline(rows.map((r) => r.inputCostUnits));

  for (const r of rows) {
    const mult = r.inputCostUnits > 0 ? Math.round(r.inputCostUnits / baseline) : 1;
    console.log(
      r.id.padEnd(35),
      (r.displayName ?? "").slice(0, 24).padEnd(25),
      String(r.inputCostUnits).padStart(8),
      String(r.outputCostUnits).padStart(8),
      `${mult}x`,
    );
  }

  console.log("-".repeat(95));
  console.log(`\nTotal: ${rows.length} models`);
  const allSame = rows.length > 0 && rows.every((r) => r.inputCostUnits === rows[0].inputCostUnits);
  if (allSame) {
    console.log(`\n⚠️ 全モデルが input_cost_units=${rows[0]?.inputCostUnits} で同一です。`);
    console.log("   OPENROUTER_API_KEY 未設定、または sync:ai-models 未実行の可能性があります。");
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
