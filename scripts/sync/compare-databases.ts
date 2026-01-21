#!/usr/bin/env bun
/**
 * Database Comparison Script
 *
 * Compares data between production and development Turso databases
 * to identify discrepancies and inconsistencies.
 *
 * Usage:
 *   bun run scripts/sync/compare-databases.ts [options]
 *
 * Options:
 *   --verbose          Show detailed differences
 *   --summary-only     Show only summary statistics
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

interface MappingConfig {
  developers: DeveloperMapping[];
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
const verbose = args.includes("--verbose");
const summaryOnly = args.includes("--summary-only");

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

  log(`📦 Connecting to databases...`, "info");
  log(`  Production: ${prodUrl}`, "verbose");
  log(`  Development: ${devUrl}`, "verbose");

  const prod = createClient({ url: prodUrl, authToken: prodToken });
  const dev = createClient({ url: devUrl, authToken: devToken });

  return { prod, dev };
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
  const BATCH_IN_SIZE = 500;

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
  const BATCH_IN_SIZE = 500;

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

function comparePages(
  prodPages: PageRow[],
  devPages: PageRow[]
): {
  onlyInProd: PageRow[];
  onlyInDev: PageRow[];
  different: Array<{
    page: PageRow;
    prod: PageRow;
    dev: PageRow;
    differences: string[];
  }>;
  identical: PageRow[];
} {
  const prodMap = new Map(prodPages.map((p) => [p.id, p]));
  const devMap = new Map(devPages.map((p) => [p.id, p]));

  const onlyInProd: PageRow[] = [];
  const onlyInDev: PageRow[] = [];
  const different: Array<{
    page: PageRow;
    prod: PageRow;
    dev: PageRow;
    differences: string[];
  }> = [];
  const identical: PageRow[] = [];

  // Check pages in production
  for (const prodPage of prodPages) {
    const devPage = devMap.get(prodPage.id);
    if (!devPage) {
      onlyInProd.push(prodPage);
    } else {
      const differences: string[] = [];
      if (prodPage.title !== devPage.title) {
        differences.push(`title: "${prodPage.title}" vs "${devPage.title}"`);
      }
      if (prodPage.content !== devPage.content) {
        differences.push(`content: different (length ${prodPage.content?.length || 0} vs ${devPage.content?.length || 0})`);
      }
      if (prodPage.thumbnail_url !== devPage.thumbnail_url) {
        differences.push(`thumbnail_url: "${prodPage.thumbnail_url}" vs "${devPage.thumbnail_url}"`);
      }
      if (prodPage.source_url !== devPage.source_url) {
        differences.push(`source_url: "${prodPage.source_url}" vs "${devPage.source_url}"`);
      }
      if (prodPage.created_at !== devPage.created_at) {
        differences.push(`created_at: ${prodPage.created_at} vs ${devPage.created_at}`);
      }
      if (prodPage.updated_at !== devPage.updated_at) {
        differences.push(`updated_at: ${prodPage.updated_at} vs ${devPage.updated_at}`);
      }
      if (prodPage.is_deleted !== devPage.is_deleted) {
        differences.push(`is_deleted: ${prodPage.is_deleted} vs ${devPage.is_deleted}`);
      }

      if (differences.length > 0) {
        different.push({
          page: prodPage,
          prod: prodPage,
          dev: devPage,
          differences,
        });
      } else {
        identical.push(prodPage);
      }
    }
  }

  // Check pages only in development
  for (const devPage of devPages) {
    if (!prodMap.has(devPage.id)) {
      onlyInDev.push(devPage);
    }
  }

  return { onlyInProd, onlyInDev, different, identical };
}

function compareLinks(
  prodLinks: LinkRow[],
  devLinks: LinkRow[]
): {
  onlyInProd: LinkRow[];
  onlyInDev: LinkRow[];
  identical: LinkRow[];
} {
  const prodSet = new Set(
    prodLinks.map((l) => `${l.source_id}:${l.target_id}`)
  );
  const devSet = new Set(
    devLinks.map((l) => `${l.source_id}:${l.target_id}`)
  );

  const onlyInProd = prodLinks.filter(
    (l) => !devSet.has(`${l.source_id}:${l.target_id}`)
  );
  const onlyInDev = devLinks.filter(
    (l) => !prodSet.has(`${l.source_id}:${l.target_id}`)
  );
  const identical = prodLinks.filter((l) =>
    devSet.has(`${l.source_id}:${l.target_id}`)
  );

  return { onlyInProd, onlyInDev, identical };
}

function compareGhostLinks(
  prodGhostLinks: GhostLinkRow[],
  devGhostLinks: GhostLinkRow[]
): {
  onlyInProd: GhostLinkRow[];
  onlyInDev: GhostLinkRow[];
  identical: GhostLinkRow[];
} {
  const prodSet = new Set(
    prodGhostLinks.map((gl) => `${gl.link_text}:${gl.source_page_id}`)
  );
  const devSet = new Set(
    devGhostLinks.map((gl) => `${gl.link_text}:${gl.source_page_id}`)
  );

  const onlyInProd = prodGhostLinks.filter(
    (gl) => !devSet.has(`${gl.link_text}:${gl.source_page_id}`)
  );
  const onlyInDev = devGhostLinks.filter(
    (gl) => !prodSet.has(`${gl.link_text}:${gl.source_page_id}`)
  );
  const identical = prodGhostLinks.filter((gl) =>
    devSet.has(`${gl.link_text}:${gl.source_page_id}`)
  );

  return { onlyInProd, onlyInDev, identical };
}

async function compareDeveloper(
  prodClient: Client,
  devClient: Client,
  mapping: DeveloperMapping
): Promise<void> {
  const { productionUserId, developmentUserId, email, description } = mapping;

  log(`\n👤 Comparing developer: ${email || description || productionUserId}`);
  log(`  Production ID: ${productionUserId}`, "verbose");
  log(`  Development ID: ${developmentUserId}`, "verbose");

  // Fetch pages
  log(`  Fetching pages...`, "verbose");
  const prodPages = await fetchPages(prodClient, productionUserId);
  const devPages = await fetchPages(devClient, developmentUserId);

  log(`  Production: ${prodPages.length} pages`);
  log(`  Development: ${devPages.length} pages`);

  // Compare pages
  const pageComparison = comparePages(prodPages, devPages);

  log(`\n  📄 Pages Comparison:`);
  log(`    ✅ Identical: ${pageComparison.identical.length}`);
  log(`    ⚠️  Different: ${pageComparison.different.length}`);
  log(`    ➕ Only in Production: ${pageComparison.onlyInProd.length}`);
  log(`    ➕ Only in Development: ${pageComparison.onlyInDev.length}`);

  if (!summaryOnly) {
    if (pageComparison.onlyInProd.length > 0) {
      log(`\n    Pages only in Production:`, "verbose");
      for (const page of pageComparison.onlyInProd) {
        log(`      - "${page.title || "(untitled)"}" (${page.id})`, "verbose");
      }
    }

    if (pageComparison.onlyInDev.length > 0) {
      log(`\n    Pages only in Development:`, "verbose");
      for (const page of pageComparison.onlyInDev) {
        log(`      - "${page.title || "(untitled)"}" (${page.id})`, "verbose");
      }
    }

    if (pageComparison.different.length > 0) {
      log(`\n    Pages with differences:`, "verbose");
      for (const diff of pageComparison.different) {
        log(`      - "${diff.page.title || "(untitled)"}" (${diff.page.id}):`, "verbose");
        for (const difference of diff.differences) {
          log(`        • ${difference}`, "verbose");
        }
      }
    }
  }

  // Fetch and compare links
  const prodPageIds = prodPages.map((p) => p.id);
  const devPageIds = devPages.map((p) => p.id);
  const allPageIds = [...new Set([...prodPageIds, ...devPageIds])];

  log(`\n  🔗 Fetching links...`, "verbose");
  const prodLinks = await fetchLinks(prodClient, prodPageIds);
  const devLinks = await fetchLinks(devClient, devPageIds);

  log(`  Production: ${prodLinks.length} links`);
  log(`  Development: ${devLinks.length} links`);

  const linkComparison = compareLinks(prodLinks, devLinks);

  log(`\n  🔗 Links Comparison:`);
  log(`    ✅ Identical: ${linkComparison.identical.length}`);
  log(`    ➕ Only in Production: ${linkComparison.onlyInProd.length}`);
  log(`    ➕ Only in Development: ${linkComparison.onlyInDev.length}`);

  if (!summaryOnly && (linkComparison.onlyInProd.length > 0 || linkComparison.onlyInDev.length > 0)) {
    if (linkComparison.onlyInProd.length > 0) {
      log(`\n    Links only in Production:`, "verbose");
      for (const link of linkComparison.onlyInProd) {
        log(`      - ${link.source_id} → ${link.target_id}`, "verbose");
      }
    }

    if (linkComparison.onlyInDev.length > 0) {
      log(`\n    Links only in Development:`, "verbose");
      for (const link of linkComparison.onlyInDev) {
        log(`      - ${link.source_id} → ${link.target_id}`, "verbose");
      }
    }
  }

  // Fetch and compare ghost links
  log(`\n  👻 Fetching ghost links...`, "verbose");
  const prodGhostLinks = await fetchGhostLinks(prodClient, prodPageIds);
  const devGhostLinks = await fetchGhostLinks(devClient, devPageIds);

  log(`  Production: ${prodGhostLinks.length} ghost links`);
  log(`  Development: ${devGhostLinks.length} ghost links`);

  const ghostLinkComparison = compareGhostLinks(prodGhostLinks, devGhostLinks);

  log(`\n  👻 Ghost Links Comparison:`);
  log(`    ✅ Identical: ${ghostLinkComparison.identical.length}`);
  log(`    ➕ Only in Production: ${ghostLinkComparison.onlyInProd.length}`);
  log(`    ➕ Only in Development: ${ghostLinkComparison.onlyInDev.length}`);

  if (!summaryOnly && (ghostLinkComparison.onlyInProd.length > 0 || ghostLinkComparison.onlyInDev.length > 0)) {
    if (ghostLinkComparison.onlyInProd.length > 0) {
      log(`\n    Ghost links only in Production:`, "verbose");
      for (const gl of ghostLinkComparison.onlyInProd) {
        log(`      - "${gl.link_text}" from page ${gl.source_page_id}`, "verbose");
      }
    }

    if (ghostLinkComparison.onlyInDev.length > 0) {
      log(`\n    Ghost links only in Development:`, "verbose");
      for (const gl of ghostLinkComparison.onlyInDev) {
        log(`      - "${gl.link_text}" from page ${gl.source_page_id}`, "verbose");
      }
    }
  }

  // Summary
  const totalIssues =
    pageComparison.onlyInProd.length +
    pageComparison.onlyInDev.length +
    pageComparison.different.length +
    linkComparison.onlyInProd.length +
    linkComparison.onlyInDev.length +
    ghostLinkComparison.onlyInProd.length +
    ghostLinkComparison.onlyInDev.length;

  if (totalIssues === 0) {
    log(`\n  ✅ Databases are in sync!`, "info");
  } else {
    log(`\n  ⚠️  Found ${totalIssues} discrepancies`, "info");
  }
}

async function main(): Promise<void> {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           Zedi Database Comparison Tool                        ║
╚════════════════════════════════════════════════════════════════╝
`);

  // Load configuration
  const config = loadConfig();

  if (config.developers.length === 0) {
    log(`\n⚠️  No developers configured. Add developers to dev-user-mapping.json`, "error");
    process.exit(1);
  }

  // Connect to databases
  const { prod, dev } = await createClients();

  // Compare each developer
  for (const developer of config.developers) {
    await compareDeveloper(prod, dev, developer);
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           ✅ Comparison Complete!                                ║
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
