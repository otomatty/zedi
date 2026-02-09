#!/usr/bin/env node
/**
 * C2-5: Aurora インポート
 * aurora-transform-*.json と page-contents-with-text-*.json を読み、
 * RDS Data API で Aurora に投入する。冪等のため INSERT ... ON CONFLICT DO NOTHING / DO UPDATE を使用。
 *
 * 前提: AWS CLI 設定済み。CLUSTER_ARN, SECRET_ARN, DATABASE は環境変数または db/aurora の既定値。
 *
 * 実行: node import-to-aurora.mjs [--dry-run] [--transform path] [--page-contents path]
 */

import { readFile, readdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, "output");

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const CLUSTER_ARN =
  process.env.CLUSTER_ARN ||
  "arn:aws:rds:ap-northeast-1:590183877893:cluster:zedi-dev-cluster";
const SECRET_ARN =
  process.env.SECRET_ARN ||
  "arn:aws:secretsmanager:ap-northeast-1:590183877893:secret:zedi-dev-db-credentials-x1aCah";
const DATABASE = process.env.DATABASE || "zedi";

const rdsClient = new RDSDataClient({ region: REGION });

function param(name, value) {
  if (value === null || value === undefined) return { name, value: { isNull: true } };
  if (typeof value === "string") return { name, value: { stringValue: value } };
  if (typeof value === "number") return { name, value: { longValue: value } };
  if (typeof value === "boolean") return { name, value: { booleanValue: value } };
  return { name, value: { stringValue: String(value) } };
}

async function runStatement(sql, parameters = []) {
  try {
    await rdsClient.send(
      new ExecuteStatementCommand({
        resourceArn: CLUSTER_ARN,
        secretArn: SECRET_ARN,
        database: DATABASE,
        sql,
        ...(parameters.length ? { parameters } : {}),
      })
    );
    return true;
  } catch (e) {
    if (e.message) process.stderr.write(String(e.message) + "\n");
    return false;
  }
}

async function findLatest(pattern, desc) {
  let files = [];
  try {
    files = await readdir(outputDir);
  } catch (_) {
    return null;
  }
  const matched = files.filter((f) => f.startsWith(pattern) && f.endsWith(".json")).sort().reverse();
  return matched.length ? join(outputDir, matched[0]) : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const transformPath = argv.find((a) => a.startsWith("--transform="))?.slice("--transform=".length);
  const pageContentsPath = argv.find((a) => a.startsWith("--page-contents="))?.slice("--page-contents=".length);

  const transformFile = transformPath || (await findLatest("aurora-transform-"));
  const pageContentsFile = pageContentsPath || (await findLatest("page-contents-with-text-"));

  if (!transformFile) {
    console.error("aurora-transform-*.json not found. Run C2-2 first.");
    process.exit(1);
  }
  if (!pageContentsFile) {
    console.error("page-contents-with-text-*.json not found. Run C2-4 first.");
    process.exit(1);
  }

  const transformData = JSON.parse(await readFile(transformFile, "utf8"));
  const pageContentsData = JSON.parse(await readFile(pageContentsFile, "utf8"));

  const users = transformData.users ?? [];
  const pages = transformData.pages ?? [];
  const links = transformData.links ?? [];
  const ghost_links = transformData.ghost_links ?? [];
  const notes = transformData.notes ?? [];
  const note_pages = transformData.note_pages ?? [];
  const note_members = transformData.note_members ?? [];
  const page_contents = pageContentsData.page_contents ?? [];

  if (dryRun) {
    console.log("DRY RUN. Would insert:", {
      users: users.length,
      pages: pages.length,
      links: links.length,
      ghost_links: ghost_links.length,
      notes: notes.length,
      note_pages: note_pages.length,
      note_members: note_members.length,
      page_contents: page_contents.length,
    });
    return;
  }

  let ok = 0;
  let fail = 0;

  // 1. users (ON CONFLICT DO NOTHING). UUID は CAST で明示
  for (const row of users) {
    const sql = `INSERT INTO users (id, cognito_sub, email, display_name, avatar_url, created_at, updated_at)
      VALUES (CAST(:id AS uuid), :cognito_sub, :email, :display_name, :avatar_url, CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz))
      ON CONFLICT (id) DO NOTHING`;
    const params = [
      param("id", row.id),
      param("cognito_sub", row.cognito_sub),
      param("email", row.email),
      param("display_name", row.display_name),
      param("avatar_url", row.avatar_url),
      param("created_at", row.created_at),
      param("updated_at", row.updated_at),
    ];
    if (await runStatement(sql, params)) ok++;
    else fail++;
  }
  console.log("users:", ok, "ok", fail, "fail");

  // 2. pages
  ok = 0;
  fail = 0;
  for (let i = 0; i < pages.length; i++) {
    const row = pages[i];
    if (i > 0 && i % 200 === 0) console.log("  pages progress:", i, "/", pages.length);
    const sql = `INSERT INTO pages (id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted)
      VALUES (CAST(:id AS uuid), CAST(:owner_id AS uuid), CAST(:source_page_id AS uuid), :title, :content_preview, :thumbnail_url, :source_url, CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz), :is_deleted)
      ON CONFLICT (id) DO NOTHING`;
    const params = [
      param("id", row.id),
      param("owner_id", row.owner_id),
      param("source_page_id", row.source_page_id),
      param("title", row.title),
      param("content_preview", row.content_preview),
      param("thumbnail_url", row.thumbnail_url),
      param("source_url", row.source_url),
      param("created_at", row.created_at),
      param("updated_at", row.updated_at),
      param("is_deleted", row.is_deleted),
    ];
    if (await runStatement(sql, params)) ok++;
    else fail++;
  }
  console.log("pages:", ok, "ok", fail, "fail");

  // 3. notes
  ok = 0;
  fail = 0;
  for (const row of notes) {
    const sql = `INSERT INTO notes (id, owner_id, title, visibility, created_at, updated_at, is_deleted)
      VALUES (CAST(:id AS uuid), CAST(:owner_id AS uuid), :title, :visibility, CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz), :is_deleted)
      ON CONFLICT (id) DO NOTHING`;
    const params = [
      param("id", row.id),
      param("owner_id", row.owner_id),
      param("title", row.title),
      param("visibility", row.visibility),
      param("created_at", row.created_at),
      param("updated_at", row.updated_at),
      param("is_deleted", row.is_deleted),
    ];
    if (await runStatement(sql, params)) ok++;
    else fail++;
  }
  console.log("notes:", ok, "ok", fail, "fail");

  // 4. note_pages
  ok = 0;
  fail = 0;
  for (const row of note_pages) {
    const sql = `INSERT INTO note_pages (note_id, page_id, added_by_user_id, sort_order, created_at, updated_at, is_deleted)
      VALUES (CAST(:note_id AS uuid), CAST(:page_id AS uuid), CAST(:added_by_user_id AS uuid), :sort_order, CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz), :is_deleted)
      ON CONFLICT (note_id, page_id) DO NOTHING`;
    const params = [
      param("note_id", row.note_id),
      param("page_id", row.page_id),
      param("added_by_user_id", row.added_by_user_id),
      param("sort_order", row.sort_order),
      param("created_at", row.created_at),
      param("updated_at", row.updated_at),
      param("is_deleted", row.is_deleted),
    ];
    if (await runStatement(sql, params)) ok++;
    else fail++;
  }
  console.log("note_pages:", ok, "ok", fail, "fail");

  // 5. note_members
  ok = 0;
  fail = 0;
  for (const row of note_members) {
    const sql = `INSERT INTO note_members (note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted)
      VALUES (CAST(:note_id AS uuid), :member_email, :role, CAST(:invited_by_user_id AS uuid), CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz), :is_deleted)
      ON CONFLICT (note_id, member_email) DO NOTHING`;
    const params = [
      param("note_id", row.note_id),
      param("member_email", row.member_email),
      param("role", row.role),
      param("invited_by_user_id", row.invited_by_user_id),
      param("created_at", row.created_at),
      param("updated_at", row.updated_at),
      param("is_deleted", row.is_deleted),
    ];
    if (await runStatement(sql, params)) ok++;
    else fail++;
  }
  console.log("note_members:", ok, "ok", fail, "fail");

  // 6. links
  ok = 0;
  fail = 0;
  for (const row of links) {
    const sql = `INSERT INTO links (source_id, target_id, created_at)
      VALUES (CAST(:source_id AS uuid), CAST(:target_id AS uuid), CAST(:created_at AS timestamptz))
      ON CONFLICT (source_id, target_id) DO NOTHING`;
    const params = [
      param("source_id", row.source_id),
      param("target_id", row.target_id),
      param("created_at", row.created_at),
    ];
    if (await runStatement(sql, params)) ok++;
    else fail++;
  }
  console.log("links:", ok, "ok", fail, "fail");

  // 7. ghost_links
  ok = 0;
  fail = 0;
  for (const row of ghost_links) {
    const sql = `INSERT INTO ghost_links (link_text, source_page_id, created_at, original_target_page_id, original_note_id)
      VALUES (:link_text, CAST(:source_page_id AS uuid), CAST(:created_at AS timestamptz), CAST(:original_target_page_id AS uuid), CAST(:original_note_id AS uuid))
      ON CONFLICT (link_text, source_page_id) DO NOTHING`;
    const params = [
      param("link_text", row.link_text),
      param("source_page_id", row.source_page_id),
      param("created_at", row.created_at),
      param("original_target_page_id", row.original_target_page_id ?? null),
      param("original_note_id", row.original_note_id ?? null),
    ];
    if (await runStatement(sql, params)) ok++;
    else fail++;
  }
  console.log("ghost_links:", ok, "ok", fail, "fail");

  // 8. page_contents (ydoc_state は decode(:ydoc_b64, 'base64') で BYTEA に)
  ok = 0;
  fail = 0;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < page_contents.length; i++) {
    const row = page_contents[i];
    if (i > 0 && i % 200 === 0) console.log("  page_contents progress:", i, "/", page_contents.length);
    const sql = `INSERT INTO page_contents (page_id, ydoc_state, version, content_text, updated_at)
      VALUES (CAST(:page_id AS uuid), decode(:ydoc_b64, 'base64'), :version, :content_text, CAST(:updated_at AS timestamptz))
      ON CONFLICT (page_id) DO UPDATE SET ydoc_state = EXCLUDED.ydoc_state, version = EXCLUDED.version, content_text = EXCLUDED.content_text, updated_at = EXCLUDED.updated_at`;
    const params = [
      param("page_id", row.page_id),
      param("ydoc_b64", row.ydoc_state_base64),
      param("version", row.version),
      param("content_text", row.content_text ?? null),
      param("updated_at", nowIso),
    ];
    if (await runStatement(sql, params)) ok++;
    else fail++;
  }
  console.log("page_contents:", ok, "ok", fail, "fail");

  console.log("C2-5 import done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
