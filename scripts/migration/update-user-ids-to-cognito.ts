#!/usr/bin/env bun
/**
 * Phase B4: Update Turso user_id columns from Clerk userId to Cognito sub.
 * Reads mapping from clerk-to-cognito-mapping.json and runs UPDATEs.
 *
 * Usage:
 *   bun run scripts/migration/update-user-ids-to-cognito.ts [options]
 *
 * Options:
 *   --env <file>     Environment file (default: .env.development)
 *   --mapping <path> Path to JSON mapping (default: docs/plans/20260208/clerk-to-cognito-mapping.json)
 *   --dry-run        Only show what would be updated; do not run UPDATEs
 */

import { createClient as createLibsqlClient, type Client } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const envArg = args.find((_, i) => args[i - 1] === "--env");
const mappingArg = args.find((_, i) => args[i - 1] === "--mapping");
const dryRun = args.includes("--dry-run");

type MappingEntry = { clerk_user_id: string; cognito_sub: string };

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

function loadMapping(projectRoot: string): MappingEntry[] {
  const defaultPath = resolve(projectRoot, "docs/plans/20260208/clerk-to-cognito-mapping.json");
  const path = mappingArg ? resolve(projectRoot, mappingArg) : defaultPath;

  if (!existsSync(path)) {
    console.error(`❌ Mapping file not found: ${path}`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  if (!Array.isArray(raw)) {
    console.error("❌ Mapping file must be a JSON array of { clerk_user_id, cognito_sub }");
    process.exit(1);
  }

  const entries: MappingEntry[] = raw
    .map((o: unknown) => {
      const obj = o as Record<string, unknown>;
      const clerk = typeof obj.clerk_user_id === "string" ? obj.clerk_user_id : "";
      const cognito = typeof obj.cognito_sub === "string" ? obj.cognito_sub : "";
      return { clerk_user_id: clerk, cognito_sub: cognito };
    })
    .filter((e) => e.clerk_user_id && e.cognito_sub);

  if (entries.length === 0) {
    console.error("❌ No valid clerk_user_id → cognito_sub entries in mapping file");
    process.exit(1);
  }

  return entries;
}

async function runMigration(client: Client, mapping: MappingEntry[]): Promise<void> {
  console.log("\n--- Phase B4: Update user_id from Clerk to Cognito sub ---\n");
  if (dryRun) {
    console.log("🔍 DRY RUN: no changes will be written.\n");
  }

  for (const { clerk_user_id, cognito_sub } of mapping) {
    console.log(`Mapping: ${clerk_user_id} → ${cognito_sub}`);

    const [pagesCount, notesCount, notePagesCount, noteMembersCount] = await Promise.all([
      client.execute({ sql: `SELECT COUNT(*) AS c FROM pages WHERE user_id = ?`, args: [clerk_user_id] }),
      client.execute({ sql: `SELECT COUNT(*) AS c FROM notes WHERE owner_user_id = ?`, args: [clerk_user_id] }),
      client.execute({ sql: `SELECT COUNT(*) AS c FROM note_pages WHERE added_by_user_id = ?`, args: [clerk_user_id] }),
      client.execute({ sql: `SELECT COUNT(*) AS c FROM note_members WHERE invited_by_user_id = ?`, args: [clerk_user_id] }),
    ]);

    const p = Number((pagesCount.rows[0] as { c?: number })?.c ?? 0);
    const n = Number((notesCount.rows[0] as { c?: number })?.c ?? 0);
    const np = Number((notePagesCount.rows[0] as { c?: number })?.c ?? 0);
    const nm = Number((noteMembersCount.rows[0] as { c?: number })?.c ?? 0);

    console.log(`  pages: ${p}, notes: ${n}, note_pages: ${np}, note_members: ${nm}`);

    if (dryRun) {
      console.log("  (dry-run: skip UPDATE)\n");
      continue;
    }

    await client.execute({
      sql: `UPDATE pages SET user_id = ? WHERE user_id = ?`,
      args: [cognito_sub, clerk_user_id],
    });
    await client.execute({
      sql: `UPDATE notes SET owner_user_id = ? WHERE owner_user_id = ?`,
      args: [cognito_sub, clerk_user_id],
    });
    await client.execute({
      sql: `UPDATE note_pages SET added_by_user_id = ? WHERE added_by_user_id = ?`,
      args: [cognito_sub, clerk_user_id],
    });
    await client.execute({
      sql: `UPDATE note_members SET invited_by_user_id = ? WHERE invited_by_user_id = ?`,
      args: [cognito_sub, clerk_user_id],
    });

    console.log("  ✅ Updated.\n");
  }

  console.log(dryRun ? "Dry run complete. Run without --dry-run to apply.\n" : "Migration complete. Reload the app and sync to see your pages.\n");
}

async function main() {
  const projectRoot = resolve(__dirname, "../..");
  const mapping = loadMapping(projectRoot);
  const client = await createClient();
  await runMigration(client, mapping);
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
