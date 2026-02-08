#!/usr/bin/env bun
/**
 * List all Clerk user_id values stored in Turso (Phase B1).
 * Use this to get the list of users to migrate from Clerk to Cognito.
 *
 * Output: distinct user_id from pages, notes, note_pages, note_members,
 * with row counts per table. Email is not stored in DB; add manually or from Clerk export.
 *
 * Usage:
 *   bun run scripts/migration/list-clerk-users.ts [options]
 *
 * Options:
 *   --env <file>   Environment file (default: .env.development)
 *   --csv          Output CSV: clerk_user_id,email,notes
 *   --json         Output JSON array of { clerk_user_id, counts }
 */

import { createClient as createLibsqlClient, type Client } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const envArg = args.find((_, i) => args[i - 1] === "--env");
const outCsv = args.includes("--csv");
const outJson = args.includes("--json");

function loadEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      )
        value = value.slice(1, -1);
      env[match[1].trim()] = value;
    }
  }
  return env;
}

async function createClient(): Promise<Client> {
  const projectRoot = resolve(__dirname, "../..");
  const envFile = envArg || ".env.development";
  const envPath = resolve(projectRoot, envFile);

  if (!existsSync(envPath)) {
    console.error(`❌ Environment file not found: ${envPath}`);
    console.error("   Use --env <file> or ensure .env.development exists with VITE_TURSO_DATABASE_URL and VITE_TURSO_AUTH_TOKEN");
    process.exit(1);
  }

  const env = loadEnvFile(envPath);
  const url = env.VITE_TURSO_DATABASE_URL;
  const token = env.VITE_TURSO_AUTH_TOKEN;

  if (!url || !token) {
    console.error(`❌ VITE_TURSO_DATABASE_URL and VITE_TURSO_AUTH_TOKEN required in ${envFile}`);
    process.exit(1);
  }

  return createLibsqlClient({ url, authToken: token });
}

type UserRow = {
  clerk_user_id: string;
  pages_count: number;
  notes_owner_count: number;
  note_pages_count: number;
  note_members_count: number;
};

async function fetchAllClerkUsers(client: Client): Promise<UserRow[]> {
  // All distinct user IDs from the four places that store Clerk user_id
  const unionSql = `
    SELECT user_id AS clerk_user_id FROM pages
    UNION
    SELECT owner_user_id AS clerk_user_id FROM notes
    UNION
    SELECT added_by_user_id AS clerk_user_id FROM note_pages
    UNION
    SELECT invited_by_user_id AS clerk_user_id FROM note_members
  `;
  const unionResult = await client.execute({ sql: unionSql });
  const allIds = unionResult.rows.map((r) => (r.clerk_user_id as string) ?? "").filter(Boolean);
  const distinctIds = [...new Set(allIds)];

  const users: UserRow[] = [];

  for (const id of distinctIds) {
    const [pagesRes, notesRes, notePagesRes, noteMembersRes] = await Promise.all([
      client.execute({ sql: `SELECT COUNT(*) AS c FROM pages WHERE user_id = ?`, args: [id] }),
      client.execute({ sql: `SELECT COUNT(*) AS c FROM notes WHERE owner_user_id = ?`, args: [id] }),
      client.execute({ sql: `SELECT COUNT(*) AS c FROM note_pages WHERE added_by_user_id = ?`, args: [id] }),
      client.execute({ sql: `SELECT COUNT(*) AS c FROM note_members WHERE invited_by_user_id = ?`, args: [id] }),
    ]);
    users.push({
      clerk_user_id: id,
      pages_count: Number((pagesRes.rows[0] as { c?: number })?.c ?? 0),
      notes_owner_count: Number((notesRes.rows[0] as { c?: number })?.c ?? 0),
      note_pages_count: Number((notePagesRes.rows[0] as { c?: number })?.c ?? 0),
      note_members_count: Number((noteMembersRes.rows[0] as { c?: number })?.c ?? 0),
    });
  }

  return users.sort((a, b) => a.clerk_user_id.localeCompare(b.clerk_user_id));
}

async function main() {
  const client = await createClient();
  const users = await fetchAllClerkUsers(client);
  client.close();

  if (outJson) {
    console.log(JSON.stringify(users, null, 2));
    return;
  }

  if (outCsv) {
    console.log("clerk_user_id,email,notes");
    for (const u of users) {
      console.log(`${u.clerk_user_id},,`);
    }
    return;
  }

  // Default: human-readable table
  console.log("\n--- Phase B1: Clerk user_id in Turso (migration candidates) ---\n");
  if (users.length === 0) {
    console.log("No user_id found in pages, notes, note_pages, or note_members.");
    console.log("(DB may be empty or not yet used with Clerk.)\n");
    return;
  }
  console.log("clerk_user_id                    | pages | notes(owner) | note_pages | note_members");
  console.log("---------------------------------+-------+--------------+------------+-------------");
  for (const u of users) {
    const id = u.clerk_user_id.padEnd(32);
    console.log(
      `${id} | ${String(u.pages_count).padStart(5)} | ${String(u.notes_owner_count).padStart(12)} | ${String(u.note_pages_count).padStart(10)} | ${String(u.note_members_count).padStart(11)}`
    );
  }
  console.log("\nEmail is not stored in Turso. Add email (or notes) manually for mapping.");
  console.log("CSV template: bun run scripts/migration/list-clerk-users.ts --csv\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
