#!/usr/bin/env node
/**
 * C2-2: ID 変換・users 生成
 * C2-1 のエクスポート JSON を読み、nanoid/既存 ID → UUID のマッピングを作成し、
 * users を生成、全テーブルを Aurora 用形式に変換する。
 * pages.content は C2-3（Tiptap → Y.Doc）用にそのまま残す。
 *
 * 使用例: node transform-id-and-users.mjs [path/to/turso-export.json]
 * 入力省略時は scripts/migration/export-turso/output/ 内の最新ファイルを使用。
 * 出力: scripts/migration/transform-for-aurora/output/aurora-transform-<timestamp>.json
 */

import { readFile, mkdir, writeFile } from "fs/promises";
import { readdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..");
const exportOutputDir = join(projectRoot, "scripts", "migration", "export-turso", "output");
const transformOutputDir = join(__dirname, "output");

function msToIso(ms) {
  if (ms == null) return null;
  const n = typeof ms === "string" ? parseInt(ms, 10) : Number(ms);
  if (Number.isNaN(n)) return null;
  return new Date(n).toISOString();
}

function toBool(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  return Number(v) === 1 || String(v).toLowerCase() === "true";
}

/** Aurora users.email は NOT NULL のためプレースホルダーを使用（初回ログインで API が更新） */
function placeholderEmail(cognitoSub) {
  const safe = String(cognitoSub).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  return `migration+${safe}@zedi.invalid`;
}

async function findLatestExport() {
  let files = [];
  try {
    files = await readdir(exportOutputDir);
  } catch (_) {
    return null;
  }
  const jsonFiles = files.filter((f) => f.startsWith("turso-export-") && f.endsWith(".json")).sort().reverse();
  return jsonFiles.length ? join(exportOutputDir, jsonFiles[0]) : null;
}

async function main() {
  const inputPath = process.argv[2] || (await findLatestExport());
  if (!inputPath) {
    console.error("Usage: node transform-id-and-users.mjs [path/to/turso-export.json]");
    console.error("Or run from project root after C2-1 export (default: latest file in export-turso/output/)");
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (err) {
    console.error("Failed to read input:", err.message);
    process.exit(1);
  }

  const tables = data.tables || data;
  const pages = tables.pages || [];
  const links = tables.links || [];
  const ghostLinks = tables.ghost_links || [];
  const notes = tables.notes || [];
  const notePages = tables.note_pages || [];
  const noteMembers = tables.note_members || [];

  // 1) 全 user 識別子を収集（Cognito sub 想定）
  const userIds = new Set();
  for (const p of pages) if (p.user_id) userIds.add(p.user_id);
  for (const n of notes) if (n.owner_user_id) userIds.add(n.owner_user_id);
  for (const np of notePages) if (np.added_by_user_id) userIds.add(np.added_by_user_id);
  for (const nm of noteMembers) if (nm.invited_by_user_id) userIds.add(nm.invited_by_user_id);

  // 2) users 生成 & cognito_sub → new user UUID マッピング
  const userMap = new Map(); // old (cognito_sub) → new user id (uuid)
  const users = [];
  const nowIso = new Date().toISOString();
  for (const cognitoSub of userIds) {
    const id = randomUUID();
    userMap.set(cognitoSub, id);
    users.push({
      id,
      cognito_sub: cognitoSub,
      email: placeholderEmail(cognitoSub),
      display_name: null,
      avatar_url: null,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  // 3) page id マッピング（旧 → 新 UUID）
  const pageIdMap = new Map();
  for (const p of pages) {
    if (p.id && !pageIdMap.has(p.id)) pageIdMap.set(p.id, randomUUID());
  }
  // source_page_id で参照されるが一覧にない ID があれば追加
  for (const p of pages) {
    if (p.source_page_id && !pageIdMap.has(p.source_page_id)) pageIdMap.set(p.source_page_id, randomUUID());
  }

  // 4) note id マッピング
  const noteIdMap = new Map();
  for (const n of notes) {
    if (n.id && !noteIdMap.has(n.id)) noteIdMap.set(n.id, randomUUID());
  }

  // 5) 変換: pages（content は C2-3 用に保持）
  const auroraPages = pages.map((p) => ({
    id: pageIdMap.get(p.id),
    owner_id: userMap.get(p.user_id),
    source_page_id: p.source_page_id ? pageIdMap.get(p.source_page_id) ?? null : null,
    title: p.title ?? null,
    content_preview: p.content_preview ?? null,
    thumbnail_url: p.thumbnail_url ?? null,
    source_url: p.source_url ?? null,
    created_at: msToIso(p.created_at) ?? nowIso,
    updated_at: msToIso(p.updated_at) ?? nowIso,
    is_deleted: toBool(p.is_deleted),
    // C2-3 用に Tiptap JSON を保持（Aurora には投入しない）
    content: p.content ?? null,
  }));

  // 6) links
  const auroraLinks = links
    .filter((l) => pageIdMap.has(l.source_id) && pageIdMap.has(l.target_id))
    .map((l) => ({
      source_id: pageIdMap.get(l.source_id),
      target_id: pageIdMap.get(l.target_id),
      created_at: msToIso(l.created_at) ?? nowIso,
    }));

  // 7) ghost_links（original_* は NULL。C2-6 で既存データは NULL のまま）
  const auroraGhostLinks = ghostLinks
    .filter((g) => pageIdMap.has(g.source_page_id))
    .map((g) => ({
      link_text: g.link_text,
      source_page_id: pageIdMap.get(g.source_page_id),
      created_at: msToIso(g.created_at) ?? nowIso,
      original_target_page_id: null,
      original_note_id: null,
    }));

  // 8) notes
  const auroraNotes = notes.map((n) => ({
    id: noteIdMap.get(n.id),
    owner_id: userMap.get(n.owner_user_id),
    title: n.title ?? null,
    visibility: n.visibility ?? "private",
    created_at: msToIso(n.created_at) ?? nowIso,
    updated_at: msToIso(n.updated_at) ?? nowIso,
    is_deleted: toBool(n.is_deleted),
  }));

  // 9) note_pages（note_id, page_id がマップに存在するもののみ）
  const auroraNotePages = notePages
    .filter((np) => noteIdMap.has(np.note_id) && pageIdMap.has(np.page_id) && userMap.has(np.added_by_user_id))
    .map((np) => ({
      note_id: noteIdMap.get(np.note_id),
      page_id: pageIdMap.get(np.page_id),
      added_by_user_id: userMap.get(np.added_by_user_id),
      sort_order: np.sort_order ?? 0,
      created_at: msToIso(np.created_at) ?? nowIso,
      updated_at: msToIso(np.updated_at) ?? nowIso,
      is_deleted: toBool(np.is_deleted),
    }));

  // 10) note_members
  const auroraNoteMembers = noteMembers
    .filter((nm) => noteIdMap.has(nm.note_id) && userMap.has(nm.invited_by_user_id))
    .map((nm) => ({
      note_id: noteIdMap.get(nm.note_id),
      member_email: nm.member_email,
      role: nm.role ?? "viewer",
      invited_by_user_id: userMap.get(nm.invited_by_user_id),
      created_at: msToIso(nm.created_at) ?? nowIso,
      updated_at: msToIso(nm.updated_at) ?? nowIso,
      is_deleted: toBool(nm.is_deleted),
    }));

  const output = {
    transformed_at: new Date().toISOString(),
    source_export: inputPath,
    users,
    pages: auroraPages,
    links: auroraLinks,
    ghost_links: auroraGhostLinks,
    notes: auroraNotes,
    note_pages: auroraNotePages,
    note_members: auroraNoteMembers,
    _mappings: {
      user_count: users.length,
      page_count: auroraPages.length,
      note_count: auroraNotes.length,
    },
  };

  await mkdir(transformOutputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(transformOutputDir, `aurora-transform-${timestamp}.json`);
  await writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("C2-2 transform done.");
  console.log("  users:", output.users.length);
  console.log("  pages:", output.pages.length);
  console.log("  links:", output.links.length);
  console.log("  ghost_links:", output.ghost_links.length);
  console.log("  notes:", output.notes.length);
  console.log("  note_pages:", output.note_pages.length);
  console.log("  note_members:", output.note_members.length);
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
