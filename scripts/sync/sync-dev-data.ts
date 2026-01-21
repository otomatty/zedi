#!/usr/bin/env bun
/**
 * Developer Data Sync Script
 *
 * Synchronizes developer user data between production and development Turso databases.
 * This allows developers to work with their real data in the development environment
 * while keeping production and development databases separate.
 *
 * Usage:
 *   bun run scripts/sync/sync-dev-data.ts [options]
 *
 * Options:
 *   --direction <dir>  Sync direction: bidirectional, prod-to-dev, dev-to-prod
 *   --dry-run          Show what would be synced without making changes
 *   --verbose          Show detailed logging
 *   --touch-updated-at Set updated_at to now on target rows
 */

import { createClient, type Client, type InValue } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration types
interface DeveloperMapping {
  email?: string;
  productionUserId: string;
  developmentUserId: string;
  description?: string;
}

interface SyncOptions {
  direction: "bidirectional" | "prod-to-dev" | "dev-to-prod";
  conflictResolution: "latest-wins" | "production-wins" | "development-wins";
  syncDeleted: boolean;
}

interface MappingConfig {
  developers: DeveloperMapping[];
  syncOptions?: SyncOptions;
}

// Page row type
interface PageRow {
  id: string;
  user_id: string;
  title: string | null;
  content: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  vector_embedding: Uint8Array | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
}

interface LinkRow {
  source_id: string;
  target_id: string;
  created_at: number;
}

interface GhostLinkRow {
  link_text: string;
  source_page_id: string;
  created_at: number;
}

// CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const directionArg = args.find((_, i) => args[i - 1] === "--direction");
const touchUpdatedAt = args.includes("--touch-updated-at");
const BATCH_IN_SIZE = 500;

function log(message: string, level: "info" | "verbose" | "error" = "info") {
  if (level === "verbose" && !verbose) return;
  if (level === "error") {
    console.error(`❌ ${message}`);
  } else {
    console.log(`${level === "verbose" ? "  " : ""}${message}`);
  }
}

function loadConfig(): MappingConfig {
  const configPath = resolve(__dirname, "dev-user-mapping.json");

  if (!existsSync(configPath)) {
    console.error(`
❌ Configuration file not found: ${configPath}

Please create dev-user-mapping.json by copying the example file:
  cp scripts/sync/dev-user-mapping.example.json scripts/sync/dev-user-mapping.json

Then fill in your production and development Clerk user IDs.
You can find your user IDs in the Clerk Dashboard.
`);
    process.exit(1);
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as MappingConfig;
  } catch (error) {
    console.error(`❌ Failed to parse configuration file: ${error}`);
    process.exit(1);
  }
}

function loadEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }

  return env;
}

async function createClients(): Promise<{
  prod: Client;
  dev: Client;
}> {
  const projectRoot = resolve(__dirname, "../..");

  // Load environment files
  const prodEnv = loadEnvFile(resolve(projectRoot, ".env.production"));
  const devEnv = loadEnvFile(resolve(projectRoot, ".env.development"));

  const prodUrl = prodEnv.VITE_TURSO_DATABASE_URL;
  const prodToken = prodEnv.VITE_TURSO_AUTH_TOKEN;
  const devUrl = devEnv.VITE_TURSO_DATABASE_URL;
  const devToken = devEnv.VITE_TURSO_AUTH_TOKEN;

  if (!prodUrl || !prodToken) {
    console.error(`
❌ Production database credentials not found.
Please ensure .env.production contains:
  VITE_TURSO_DATABASE_URL=...
  VITE_TURSO_AUTH_TOKEN=...
`);
    process.exit(1);
  }

  if (!devUrl || !devToken) {
    console.error(`
❌ Development database credentials not found.
Please ensure .env.development contains:
  VITE_TURSO_DATABASE_URL=...
  VITE_TURSO_AUTH_TOKEN=...
`);
    process.exit(1);
  }

  // Check if dev credentials are still placeholder values
  if (devUrl.includes("YOUR_") || devToken.includes("YOUR_")) {
    console.error(`
❌ Development database credentials are not configured.
Please update .env.development with your actual development Turso credentials.

To create a development database:
  turso db create zedi-dev --region nrt
  turso db show zedi-dev --url
  turso db tokens create zedi-dev
`);
    process.exit(1);
  }

  log(`📦 Connecting to databases...`, "info");
  log(`  Production: ${prodUrl}`, "verbose");
  log(`  Development: ${devUrl}`, "verbose");

  const prod = createClient({ url: prodUrl, authToken: prodToken });
  const dev = createClient({ url: devUrl, authToken: devToken });

  return { prod, dev };
}

async function ensureSchema(client: Client, dbName: string): Promise<void> {
  log(`🔧 Ensuring schema exists on ${dbName}...`, "verbose");

  const schema = `
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      content TEXT,
      thumbnail_url TEXT,
      source_url TEXT,
      vector_embedding BLOB,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_pages_title ON pages(title);
    CREATE INDEX IF NOT EXISTS idx_pages_created_at ON pages(created_at);
    CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages(user_id);
    CREATE INDEX IF NOT EXISTS idx_pages_user_created ON pages(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS links (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (source_id, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);

    CREATE TABLE IF NOT EXISTS ghost_links (
      link_text TEXT NOT NULL,
      source_page_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (link_text, source_page_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ghost_links_text ON ghost_links(link_text);
  `;

  const statements = schema
    .split(";")
    .filter((s) => s.trim())
    .map((s) => s.trim() + ";");
  for (const stmt of statements) {
    await client.execute(stmt);
  }

  log(`✅ Schema ready on ${dbName}`, "verbose");
}

async function fetchPages(
  client: Client,
  userId: string
): Promise<PageRow[]> {
  const result = await client.execute({
    sql: `SELECT * FROM pages WHERE user_id = ?`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string | null,
    content: row.content as string | null,
    thumbnail_url: row.thumbnail_url as string | null,
    source_url: row.source_url as string | null,
    vector_embedding: row.vector_embedding as Uint8Array | null,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    is_deleted: row.is_deleted as number,
  }));
}

async function fetchLinks(client: Client, pageIds: string[]): Promise<LinkRow[]> {
  if (pageIds.length === 0) return [];

  const links: LinkRow[] = [];

  for (let i = 0; i < pageIds.length; i += BATCH_IN_SIZE) {
    const batchIds = pageIds.slice(i, i + BATCH_IN_SIZE);
    const placeholders = batchIds.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT * FROM links WHERE source_id IN (${placeholders})`,
      args: batchIds as InValue[],
    });

    for (const row of result.rows) {
      links.push({
        source_id: row.source_id as string,
        target_id: row.target_id as string,
        created_at: row.created_at as number,
      });
    }
  }

  return links;
}

async function fetchGhostLinks(
  client: Client,
  pageIds: string[]
): Promise<GhostLinkRow[]> {
  if (pageIds.length === 0) return [];

  const ghostLinks: GhostLinkRow[] = [];

  for (let i = 0; i < pageIds.length; i += BATCH_IN_SIZE) {
    const batchIds = pageIds.slice(i, i + BATCH_IN_SIZE);
    const placeholders = batchIds.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT * FROM ghost_links WHERE source_page_id IN (${placeholders})`,
      args: batchIds as InValue[],
    });

    for (const row of result.rows) {
      ghostLinks.push({
        link_text: row.link_text as string,
        source_page_id: row.source_page_id as string,
        created_at: row.created_at as number,
      });
    }
  }

  return ghostLinks;
}

async function syncPages(
  sourceClient: Client,
  targetClient: Client,
  sourceUserId: string,
  targetUserId: string,
  direction: string,
  conflictResolution: string,
  syncDeleted: boolean,
  touchUpdatedAt: boolean
): Promise<{ synced: number; skipped: number }> {
  log(`  Fetching pages from source...`, "verbose");
  const sourcePages = await fetchPages(sourceClient, sourceUserId);
  const targetPages = await fetchPages(targetClient, targetUserId);

  const targetPageMap = new Map(targetPages.map((p) => [p.id, p]));

  let synced = 0;
  let skipped = 0;

  for (const page of sourcePages) {
    // Skip deleted pages if not syncing them
    if (!syncDeleted && page.is_deleted === 1) {
      skipped++;
      continue;
    }

    const existingPage = targetPageMap.get(page.id);

    // Determine if we should sync this page
    let shouldSync = false;
    if (!existingPage) {
      shouldSync = true;
    } else {
      switch (conflictResolution) {
        case "latest-wins":
          shouldSync = page.updated_at > existingPage.updated_at;
          break;
        case "production-wins":
          shouldSync = direction === "prod-to-dev";
          break;
        case "development-wins":
          shouldSync = direction === "dev-to-prod";
          break;
      }
    }

    if (shouldSync) {
      if (!dryRun) {
        const updatedAt = touchUpdatedAt ? Date.now() : page.updated_at;
        await targetClient.execute({
          sql: `INSERT OR REPLACE INTO pages 
                (id, user_id, title, content, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            page.id,
            targetUserId, // Use target user ID!
            page.title,
            page.content,
            page.thumbnail_url,
            page.source_url,
            page.vector_embedding,
            page.created_at,
            updatedAt,
            page.is_deleted,
          ] as InValue[],
        });
      }
      synced++;
      log(
        `    ${dryRun ? "[DRY-RUN] Would sync" : "Synced"}: "${page.title || "(untitled)"}" (${page.id})`,
        "verbose"
      );
    } else {
      skipped++;
    }
  }

  return { synced, skipped };
}

async function syncLinks(
  sourceClient: Client,
  targetClient: Client,
  sourceUserId: string,
  _targetUserId: string,
  syncDeleted: boolean
): Promise<number> {
  // Get page IDs for this user
  const sourcePages = await fetchPages(sourceClient, sourceUserId);
  const pageIds = sourcePages
    .filter((p) => syncDeleted || p.is_deleted === 0)
    .map((p) => p.id);

  if (pageIds.length === 0) return 0;

  const links = await fetchLinks(sourceClient, pageIds);

  if (!dryRun) {
    for (let i = 0; i < pageIds.length; i += BATCH_IN_SIZE) {
      const batchIds = pageIds.slice(i, i + BATCH_IN_SIZE);
      const placeholders = batchIds.map(() => "?").join(",");
      await targetClient.execute({
        sql: `DELETE FROM links WHERE source_id IN (${placeholders})`,
        args: batchIds as InValue[],
      });
    }

    for (const link of links) {
      await targetClient.execute({
        sql: `INSERT OR REPLACE INTO links (source_id, target_id, created_at) VALUES (?, ?, ?)`,
        args: [link.source_id, link.target_id, link.created_at] as InValue[],
      });
    }
  }

  return links.length;
}

async function syncGhostLinks(
  sourceClient: Client,
  targetClient: Client,
  sourceUserId: string,
  _targetUserId: string,
  syncDeleted: boolean
): Promise<number> {
  // Get page IDs for this user
  const sourcePages = await fetchPages(sourceClient, sourceUserId);
  const pageIds = sourcePages
    .filter((p) => syncDeleted || p.is_deleted === 0)
    .map((p) => p.id);

  if (pageIds.length === 0) return 0;

  const ghostLinks = await fetchGhostLinks(sourceClient, pageIds);

  if (!dryRun) {
    for (let i = 0; i < pageIds.length; i += BATCH_IN_SIZE) {
      const batchIds = pageIds.slice(i, i + BATCH_IN_SIZE);
      const placeholders = batchIds.map(() => "?").join(",");
      await targetClient.execute({
        sql: `DELETE FROM ghost_links WHERE source_page_id IN (${placeholders})`,
        args: batchIds as InValue[],
      });
    }

    for (const link of ghostLinks) {
      await targetClient.execute({
        sql: `INSERT OR REPLACE INTO ghost_links (link_text, source_page_id, created_at) VALUES (?, ?, ?)`,
        args: [link.link_text, link.source_page_id, link.created_at] as InValue[],
      });
    }
  }

  return ghostLinks.length;
}

async function syncDeveloper(
  prodClient: Client,
  devClient: Client,
  mapping: DeveloperMapping,
  options: SyncOptions
): Promise<void> {
  const { productionUserId, developmentUserId, email, description } = mapping;
  const { direction, conflictResolution, syncDeleted } = options;

  log(`\n👤 Syncing developer: ${email || description || productionUserId}`);
  log(`  Production ID: ${productionUserId}`, "verbose");
  log(`  Development ID: ${developmentUserId}`, "verbose");

  // Sync based on direction
  if (direction === "prod-to-dev" || direction === "bidirectional") {
    log(`  ➡️  Production → Development`, "info");
    const { synced, skipped } = await syncPages(
      prodClient,
      devClient,
      productionUserId,
      developmentUserId,
      "prod-to-dev",
      conflictResolution,
      syncDeleted,
      touchUpdatedAt
    );
    const linksCount = await syncLinks(
      prodClient,
      devClient,
      productionUserId,
      developmentUserId,
      syncDeleted
    );
    const ghostLinksCount = await syncGhostLinks(
      prodClient,
      devClient,
      productionUserId,
      developmentUserId,
      syncDeleted
    );
    
    log(`     Pages: ${synced} synced, ${skipped} skipped`);
    log(`     Links: ${linksCount}, Ghost Links: ${ghostLinksCount}`, "verbose");
  }

  if (direction === "dev-to-prod" || direction === "bidirectional") {
    log(`  ⬅️  Development → Production`, "info");
    const { synced, skipped } = await syncPages(
      devClient,
      prodClient,
      developmentUserId,
      productionUserId,
      "dev-to-prod",
      conflictResolution,
      syncDeleted,
      touchUpdatedAt
    );
    const linksCount = await syncLinks(
      devClient,
      prodClient,
      developmentUserId,
      productionUserId,
      syncDeleted
    );
    const ghostLinksCount = await syncGhostLinks(
      devClient,
      prodClient,
      developmentUserId,
      productionUserId,
      syncDeleted
    );
    
    log(`     Pages: ${synced} synced, ${skipped} skipped`);
    log(`     Links: ${linksCount}, Ghost Links: ${ghostLinksCount}`, "verbose");
  }
}

async function main(): Promise<void> {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           Zedi Developer Data Sync                             ║
╚════════════════════════════════════════════════════════════════╝
`);

  if (dryRun) {
    log(`🔍 DRY RUN MODE - No changes will be made\n`, "info");
  }

  // Load configuration
  const config = loadConfig();

  // Determine sync options
  const syncOptions: SyncOptions = {
    direction:
      (directionArg as SyncOptions["direction"]) ||
      config.syncOptions?.direction ||
      "bidirectional",
    conflictResolution:
      config.syncOptions?.conflictResolution || "latest-wins",
    syncDeleted: config.syncOptions?.syncDeleted ?? true,
  };

  log(`📋 Configuration:`);
  log(`   Direction: ${syncOptions.direction}`);
  log(`   Conflict Resolution: ${syncOptions.conflictResolution}`);
  log(`   Sync Deleted: ${syncOptions.syncDeleted}`);
  log(`   Touch updated_at: ${touchUpdatedAt}`);
  log(`   Developers: ${config.developers.length}`);

  if (config.developers.length === 0) {
    log(`\n⚠️  No developers configured. Add developers to dev-user-mapping.json`, "error");
    process.exit(1);
  }

  // Connect to databases
  const { prod, dev } = await createClients();

  // Ensure schema exists on development database
  await ensureSchema(dev, "development");

  // Sync each developer
  for (const developer of config.developers) {
    await syncDeveloper(prod, dev, developer, syncOptions);
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           ✅ Sync Complete!                                    ║
╚════════════════════════════════════════════════════════════════╝
`);
}

main().catch((error) => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  if (verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});
