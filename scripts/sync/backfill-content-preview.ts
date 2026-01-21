#!/usr/bin/env bun
/**
 * Backfill content_preview for existing pages in Turso database
 *
 * This script adds the content_preview column to the pages table if it doesn't exist,
 * and generates preview text from existing content for all pages that don't have a preview yet.
 *
 * Usage:
 *   bun run scripts/sync/backfill-content-preview.ts [options]
 *
 * Options:
 *   --env <file>     Environment file to use (default: .env.production)
 *   --dry-run        Show what would be updated without making changes
 *   --verbose        Show detailed logging
 *   --batch-size     Number of pages to process per batch (default: 100)
 *   --force          Regenerate previews for pages that already have content_preview
 */

import { createClient as createLibsqlClient, type Client } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import contentUtils functions
// Note: We need to implement the preview logic here since we can't easily import from src
// in a standalone script. We'll replicate the logic.

const PAGE_LIST_PREVIEW_LENGTH = 120;

function extractPlainText(content: string): string {
  if (!content) return "";

  try {
    const doc = JSON.parse(content);
    return extractTextFromNode(doc);
  } catch {
    // If not JSON, assume it's already plain text
    return content;
  }
}

function extractTextFromNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const typedNode = node as {
    type?: string;
    text?: string;
    content?: unknown[];
  };

  if (typedNode.type === "text") {
    return typeof typedNode.text === "string" ? typedNode.text : "";
  }

  if (Array.isArray(typedNode.content)) {
    return typedNode.content.map(extractTextFromNode).join(" ");
  }

  return "";
}

function getContentPreview(content: string, maxLength: number = 100): string {
  const plainText = extractPlainText(content);
  const trimmed = plainText.trim().replace(/\s+/g, " ");

  if (trimmed.length <= maxLength) return trimmed;

  return trimmed.slice(0, maxLength).trim() + "...";
}

function getPageListPreview(content: string): string {
  return getContentPreview(content, PAGE_LIST_PREVIEW_LENGTH);
}

// CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const force = args.includes("--force");
const envArg = args.find((_, i) => args[i - 1] === "--env");
const batchSizeArg = args.find((_, i) => args[i - 1] === "--batch-size");
const BATCH_SIZE = batchSizeArg
  ? parseInt(batchSizeArg, 10)
  : 100;

function log(message: string, level: "info" | "verbose" | "error" = "info") {
  if (level === "verbose" && !verbose) return;
  if (level === "error") {
    console.error(`❌ ${message}`);
  } else {
    console.log(`${level === "verbose" ? "  " : ""}${message}`);
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

async function createClient(): Promise<Client> {
  const projectRoot = resolve(__dirname, "../..");
  const envFile = envArg || ".env.production";
  const envPath = resolve(projectRoot, envFile);

  if (!existsSync(envPath)) {
    console.error(`
❌ Environment file not found: ${envPath}

Please ensure the environment file exists and contains:
  VITE_TURSO_DATABASE_URL=...
  VITE_TURSO_AUTH_TOKEN=...

Or specify a different file with --env <file>
`);
    process.exit(1);
  }

  const env = loadEnvFile(envPath);

  const url = env.VITE_TURSO_DATABASE_URL;
  const token = env.VITE_TURSO_AUTH_TOKEN;

  if (!url || !token) {
    console.error(`
❌ Database credentials not found in ${envFile}.
Please ensure it contains:
  VITE_TURSO_DATABASE_URL=...
  VITE_TURSO_AUTH_TOKEN=...
`);
    process.exit(1);
  }

  log(`📦 Connecting to database...`, "info");
  log(`  URL: ${url}`, "verbose");

  return createLibsqlClient({ url, authToken: token });
}

async function hasColumn(
  client: Client,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await client.execute({
    sql: `PRAGMA table_info(${tableName})`,
  });

  return result.rows.some((row) => row.name === columnName);
}

async function addContentPreviewColumn(client: Client): Promise<{ added: boolean; exists: boolean }> {
  const exists = await hasColumn(client, "pages", "content_preview");
  if (exists) {
    log(`✓ content_preview column already exists`, "info");
    return { added: false, exists: true };
  }

  log(`🔧 Adding content_preview column...`, "info");
  if (!dryRun) {
    await client.execute({
      sql: `ALTER TABLE pages ADD COLUMN content_preview TEXT`,
    });
    log(`✓ Column added successfully`, "info");
    return { added: true, exists: true };
  } else {
    log(`  [DRY RUN] Would add content_preview column`, "info");
    return { added: false, exists: false };
  }
}

interface PageRow {
  id: string;
  user_id: string;
  title: string | null;
  content: string | null;
  content_preview: string | null;
  updated_at: number;
}

async function backfillPreviews(
  client: Client,
  force: boolean,
  columnExists: boolean
): Promise<number> {
  log(`🔄 Starting preview backfill...`, "info");

  if (!columnExists) {
    log(`⚠️  content_preview column does not exist. Skipping backfill.`, "info");
    log(`  Run without --dry-run to add the column first.`, "info");
    return 0;
  }

  const whereClause = force
    ? `WHERE content IS NOT NULL AND content != ''`
    : `WHERE (content_preview IS NULL OR content_preview = '') AND content IS NOT NULL AND content != ''`;

  // Get total count
  const countResult = await client.execute({
    sql: `SELECT COUNT(*) as count FROM pages ${whereClause}`,
  });
  const totalCount = (countResult.rows[0]?.count as number) || 0;

  if (totalCount === 0) {
    log(`✓ No pages need preview backfill`, "info");
    return 0;
  }

  log(`  Found ${totalCount} pages to process`, "info");

  let offset = 0;
  let processed = 0;
  let updated = 0;
  let errors = 0;

  while (offset < totalCount) {
    // Fetch a batch
    const result = await client.execute({
      sql: `SELECT id, user_id, title, content, content_preview, updated_at 
            FROM pages 
            ${whereClause}
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?`,
      args: [BATCH_SIZE, offset],
    });

    const rows = result.rows as unknown as PageRow[];

    if (rows.length === 0) {
      break;
    }

    log(
      `  Processing batch: ${offset + 1}-${offset + rows.length} of ${totalCount}`,
      "verbose"
    );

    // Process each page
    for (const row of rows) {
      try {
        const content = row.content || "";
        const existingPreview = row.content_preview;

        // Skip if preview already exists and not forcing
        if (!force && existingPreview && existingPreview.trim() !== "") {
          processed++;
          continue;
        }

        const preview = getPageListPreview(content);

        // Skip if preview is the same (to avoid unnecessary updates)
        if (existingPreview === preview) {
          processed++;
          continue;
        }

        if (dryRun) {
          log(
            `  [DRY RUN] Would update page ${row.id}: "${preview.substring(0, 50)}..."`,
            "verbose"
          );
        } else {
          await client.execute({
            sql: `UPDATE pages SET content_preview = ? WHERE id = ?`,
            args: [preview, row.id],
          });
        }

        updated++;
        processed++;
      } catch (error) {
        log(
          `  Error processing page ${row.id}: ${error}`,
          "error"
        );
        errors++;
        processed++;
      }
    }

    offset += rows.length;

    if (rows.length > 0) {
      log(`  Progress: ${processed}/${totalCount} processed, ${updated} updated, ${errors} errors`, "info");
    }
  }

  log(`✓ Backfill complete: ${updated} pages updated, ${errors} errors`, "info");
  return updated;
}

async function main() {
  log(`🚀 Starting content_preview backfill script`, "info");
  if (dryRun) {
    log(`⚠️  DRY RUN MODE - No changes will be made`, "info");
  }
  log(`  Batch size: ${BATCH_SIZE}`, "verbose");
  log(`  Force mode: ${force ? "enabled" : "disabled"}`, "verbose");

  try {
    const client = await createClient();

    // Check/add column
    const columnResult = await addContentPreviewColumn(client);
    const columnExists = columnResult.exists;

    // Backfill previews
    const updated = await backfillPreviews(client, force, columnExists);

    log(`\n✅ Script completed successfully`, "info");
    if (columnResult.added) {
      log(`  - Added content_preview column`, "info");
    }
    if (updated > 0) {
      log(`  - Updated ${updated} pages with preview text`, "info");
    }

    if (dryRun) {
      log(`\n⚠️  This was a dry run. Run without --dry-run to apply changes.`, "info");
    }
  } catch (error) {
    log(`\n❌ Script failed: ${error}`, "error");
    process.exit(1);
  }
}

main();
