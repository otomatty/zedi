#!/usr/bin/env node
/**
 * Zedi MCP CLI — PKCE ログインコマンド
 *
 * 使い方:
 *   bunx \@zedi/mcp-server login \[--api-url https://api.example.com\]
 *   bunx \@zedi/mcp-server whoami
 *
 * login の流れ:
 *   1. ランダム code_verifier を生成し SHA256 で code_challenge を計算
 *   2. ローカル HTTP サーバを起動して `code` の受け取りを待つ
 *   3. ブラウザで `<api>/mcp/authorize` を開く
 *   4. ユーザーが Web 側で承認 → ローカルコールバックに `?code=...` でリダイレクト
 *   5. `POST /api/mcp/session` で code + verifier を JWT に交換
 *   6. JWT を `~/.config/zedi/mcp.json` (Windows: `%APPDATA%\zedi\mcp.json`) に保存
 *
 * PKCE login CLI for the Zedi MCP server. Persists the issued JWT to disk.
 */
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import open from "open";
import { HttpZediClient } from "../client/httpClient.js";
import {
  loadMcpClientConfig,
  resolveMcpClientConfigPath,
  type McpClientConfig,
} from "../config.js";

const DEFAULT_API_URL = "https://api.zedi.app";

interface LoginOptions {
  apiUrl: string;
}

/**
 * argv[2] 以降をパースし、コマンド名とオプションを返す。
 * Parses argv[2..] into a command and options.
 */
function parseArgs(argv: string[]): { command: string; options: LoginOptions } {
  const command = argv[2] ?? "login";
  let apiUrl = process.env.ZEDI_API_URL ?? DEFAULT_API_URL;
  for (let i = 3; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === "--api-url" && value !== undefined) {
      apiUrl = value;
      i++;
    }
  }
  return { command, options: { apiUrl } };
}

function generateVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function challengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function login(options: LoginOptions): Promise<void> {
  const verifier = generateVerifier();
  const challenge = challengeFromVerifier(verifier);
  const state = randomBytes(16).toString("base64url");

  // Start an ephemeral local HTTP server, learn its port via the listen callback,
  // build the authorize URL with that redirect_uri, then open the browser.
  // ローカルサーバを起動 → listen コールバックでポート確定 → ブラウザを開いて承認を待つ。
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/callback") {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        const c = url.searchParams.get("code");
        const s = url.searchParams.get("state");
        if (!c || s !== state) {
          res.statusCode = 400;
          res.end("invalid callback");
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<html><body><h2>Zedi MCP authorized</h2><p>You can close this window.</p></body></html>",
        );
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        server.close();
        resolve({ code: c, redirectUri: `http://127.0.0.1:${port}/callback` });
      });
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const authorizeUrl = new URL("/mcp/authorize", options.apiUrl);
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("code_challenge", challenge);
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("scopes", "mcp:read,mcp:write");
        console.log(`Opening browser:\n  ${authorizeUrl.toString()}`);
        open(authorizeUrl.toString()).catch((err) => {
          console.error(`Failed to open browser automatically: ${(err as Error).message}`);
          console.error(`Please open the URL above manually.`);
        });
      });
    },
  );

  // Exchange code → JWT
  // code を JWT に交換する。
  const sessionUrl = new URL("/api/mcp/session", options.apiUrl);
  const tokenRes = await fetch(sessionUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`);
  }
  const tokenBody = (await tokenRes.json()) as { access_token?: string };
  if (!tokenBody.access_token) {
    throw new Error("Token exchange returned no access_token");
  }

  const cfg: McpClientConfig = { apiUrl: options.apiUrl, token: tokenBody.access_token };
  const cfgPath = resolveMcpClientConfigPath();
  mkdirSync(dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
  console.log(`Saved Zedi MCP credentials to ${cfgPath}`);
  console.log("You can now register the stdio server with Claude Code.");
}

async function whoami(options: LoginOptions): Promise<void> {
  const cfg = loadMcpClientConfig();
  const apiUrl = cfg?.apiUrl ?? options.apiUrl;
  const token = cfg?.token;
  if (!token) {
    console.error("Not logged in. Run `zedi-mcp-cli login` first.");
    process.exit(1);
  }
  const client = new HttpZediClient({ baseUrl: apiUrl, token });
  const user = await client.getCurrentUser();
  console.log(JSON.stringify(user, null, 2));
}

async function main() {
  const { command, options } = parseArgs(process.argv);
  switch (command) {
    case "login":
      await login(options);
      break;
    case "whoami":
      await whoami(options);
      break;
    default:
      console.error(`Unknown command: ${command}. Available: login, whoami`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("[zedi-mcp-cli] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
