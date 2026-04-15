/**
 * MCP 用 JWT を手動発行するスクリプト (MVP)
 *
 * 必要な環境変数:
 *   BETTER_AUTH_SECRET   必須 (JWT 署名鍵)
 *   MCP_JWT_EXP_DAYS     任意 (デフォルト 30)
 *
 * 実行例:
 *   cd server/api && bun run scripts/issue-mcp-token.ts <userId> [scopes]
 *   例:
 *     bun run scripts/issue-mcp-token.ts user-1
 *     bun run scripts/issue-mcp-token.ts user-1 mcp:read
 *     bun run scripts/issue-mcp-token.ts user-1 mcp:read,mcp:write
 *
 * 出力 (例):
 *   \{"access_token":"<jwt>","expires_in":2592000,"scope":"mcp:read mcp:write"\}
 *
 * Manual MCP JWT issuance script (MVP). Outputs JSON to stdout.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { issueMcpToken, MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../src/lib/mcpAuth.js";

/** プロジェクトルートの .env を読み込み process.env にマージする (未設定のキーのみ) */
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

  const userId = process.argv[2];
  const scopesArg = process.argv[3];
  if (!userId) {
    console.error("Usage: bun run scripts/issue-mcp-token.ts <userId> [mcp:read,mcp:write]");
    process.exit(1);
  }

  const scopes = scopesArg
    ? scopesArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [MCP_SCOPE_READ, MCP_SCOPE_WRITE];

  const valid = new Set([MCP_SCOPE_READ, MCP_SCOPE_WRITE]);
  for (const s of scopes) {
    if (!valid.has(s)) {
      console.error(`Invalid scope: ${s}. Allowed: ${[...valid].join(", ")}`);
      process.exit(1);
    }
  }

  const { access_token, expires_in } = await issueMcpToken(userId, scopes);
  process.stdout.write(
    JSON.stringify({
      access_token,
      expires_in,
      scope: scopes.join(" "),
    }) + "\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
