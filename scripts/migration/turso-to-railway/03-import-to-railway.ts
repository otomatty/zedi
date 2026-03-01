/* eslint-disable @typescript-eslint/no-explicit-any, complexity */
/**
 * Step 3: Import transformed data into Railway PostgreSQL.
 *
 * Reads the transformed JSON and inserts pages, page_contents, and links.
 * Uses ON CONFLICT DO NOTHING for idempotent re-runs.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/migration/turso-to-railway/03-import-to-railway.ts [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const BATCH_SIZE = 50;

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  const inputPath = join(OUTPUT_DIR, "02-transformed.json");
  if (!existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}\nRun 02-transform.ts first.`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL must be set");
    process.exit(1);
  }

  console.log("Reading transformed data...");
  const data = JSON.parse(readFileSync(inputPath, "utf-8"));
  const pages: any[] = data.pages;
  const pageContents: any[] = data.pageContents;
  const links: any[] = data.links;

  console.log(`  Pages: ${pages.length}`);
  console.log(`  Page contents: ${pageContents.length}`);
  console.log(`  Links: ${links.length}`);
  console.log(`  Target user: ${data.targetUserId}`);

  if (isDryRun) {
    console.log("\n[DRY RUN] Would insert the above. Exiting.");
    process.exit(0);
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    // Verify target user exists
    const userCheck = await pool.query('SELECT id FROM "user" WHERE id = $1', [data.targetUserId]);
    if (userCheck.rows.length === 0) {
      console.error(`Target user not found: ${data.targetUserId}`);
      console.error("The user must exist in the PostgreSQL 'user' table before importing.");
      process.exit(1);
    }
    console.log(`\nTarget user verified: ${userCheck.rows[0].id}`);

    let insertedPages = 0;
    let insertedContents = 0;
    let insertedLinks = 0;
    let skippedPages = 0;
    let skippedContents = 0;

    // Insert pages in batches
    console.log("\nInserting pages...");
    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const p of batch) {
          const result = await client.query(
            `INSERT INTO pages (id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [
              p.id,
              p.owner_id,
              p.source_page_id,
              p.title,
              p.content_preview,
              p.thumbnail_url,
              p.source_url,
              p.created_at,
              p.updated_at,
              p.is_deleted,
            ],
          );
          if (result.rowCount && result.rowCount > 0) insertedPages++;
          else skippedPages++;
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= pages.length) {
        console.log(`  ${Math.min(i + BATCH_SIZE, pages.length)}/${pages.length} processed`);
      }
    }
    console.log(`  Inserted: ${insertedPages}, Skipped (already exist): ${skippedPages}`);

    // Insert page_contents in batches
    console.log("\nInserting page contents (Y.Doc state)...");
    for (let i = 0; i < pageContents.length; i += BATCH_SIZE) {
      const batch = pageContents.slice(i, i + BATCH_SIZE);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const pc of batch) {
          const ydocBuffer = Buffer.from(pc.ydoc_state_base64, "base64");
          const result = await client.query(
            `INSERT INTO page_contents (page_id, ydoc_state, version, content_text, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (page_id) DO NOTHING`,
            [pc.page_id, ydocBuffer, pc.version, pc.content_text, pc.updated_at],
          );
          if (result.rowCount && result.rowCount > 0) insertedContents++;
          else skippedContents++;
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= pageContents.length) {
        console.log(
          `  ${Math.min(i + BATCH_SIZE, pageContents.length)}/${pageContents.length} processed`,
        );
      }
    }
    console.log(`  Inserted: ${insertedContents}, Skipped: ${skippedContents}`);

    // Insert links
    if (links.length > 0) {
      console.log("\nInserting links...");
      for (const l of links) {
        const result = await pool.query(
          `INSERT INTO links (source_id, target_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (source_id, target_id) DO NOTHING`,
          [l.source_id, l.target_id, l.created_at],
        );
        if (result.rowCount && result.rowCount > 0) insertedLinks++;
      }
      console.log(`  Inserted: ${insertedLinks}`);
    }

    // Verification
    console.log("\n=== Verification ===");
    const counts = await pool.query(
      `
      SELECT 'pages' as tbl, COUNT(*)::int as cnt FROM pages WHERE owner_id = $1
      UNION ALL SELECT 'page_contents', COUNT(*) FROM page_contents pc JOIN pages p ON pc.page_id = p.id WHERE p.owner_id = $1
      UNION ALL SELECT 'links', COUNT(*) FROM links l JOIN pages p ON l.source_id = p.id WHERE p.owner_id = $1
    `,
      [data.targetUserId],
    );

    const report: Record<string, any> = {
      importedAt: new Date().toISOString(),
      targetUserId: data.targetUserId,
      results: {},
    };
    counts.rows.forEach((r: any) => {
      console.log(`  ${r.tbl}: ${r.cnt}`);
      report.results[r.tbl] = r.cnt;
    });
    report.inserted = {
      pages: insertedPages,
      pageContents: insertedContents,
      links: insertedLinks,
    };
    report.skipped = { pages: skippedPages, pageContents: skippedContents };

    const reportPath = join(OUTPUT_DIR, "03-import-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);
    console.log("Migration complete!");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
