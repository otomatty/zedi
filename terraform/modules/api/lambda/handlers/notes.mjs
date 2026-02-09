/**
 * ノート API: GET/POST/PUT/DELETE /api/notes, /api/notes/:id/pages, /api/notes/:id/members
 * C1-6: 自分がアクセス可能なノート（owner または member）。ノート内新規ページは owner_id = notes.owner_id。
 */

import * as res from "../responses.mjs";
import { execute } from "../lib/db.mjs";

const GET_USER_SQL = `
SELECT id, email FROM users WHERE cognito_sub = :cognito_sub
`;

const LIST_NOTES_SQL = `
SELECT DISTINCT n.id, n.owner_id, n.title, n.visibility, n.created_at, n.updated_at, n.is_deleted
FROM notes n
LEFT JOIN note_members nm ON nm.note_id = n.id AND nm.member_email = :user_email AND nm.is_deleted = FALSE
WHERE n.is_deleted = FALSE AND (n.owner_id = :owner_id OR nm.note_id IS NOT NULL)
ORDER BY n.updated_at DESC
`;

const GET_NOTE_SQL = `
SELECT id, owner_id, title, visibility, created_at, updated_at, is_deleted
FROM notes WHERE id = :id AND is_deleted = FALSE
`;

const GET_NOTE_PAGES_SQL = `
SELECT p.id, p.owner_id, p.source_page_id, p.title, p.content_preview, p.thumbnail_url, p.source_url,
       p.created_at, p.updated_at, p.is_deleted AS page_is_deleted,
       np.sort_order, np.added_by_user_id, np.created_at AS added_at
FROM note_pages np
JOIN pages p ON p.id = np.page_id
WHERE np.note_id = :note_id AND np.is_deleted = FALSE AND p.is_deleted = FALSE
ORDER BY np.sort_order ASC, np.created_at ASC
`;

const INSERT_NOTE_SQL = `
INSERT INTO notes (id, owner_id, title, visibility)
VALUES (
  COALESCE(NULLIF(TRIM(COALESCE(:id, '')), '')::uuid, gen_random_uuid()),
  :owner_id,
  :title,
  COALESCE(:visibility, 'private')
)
RETURNING id, owner_id, title, visibility, created_at, updated_at, is_deleted
`;

const UPDATE_NOTE_SQL = `
UPDATE notes SET title = COALESCE(NULLIF(TRIM(:title), ''), title), visibility = COALESCE(:visibility, visibility), updated_at = NOW()
WHERE id = :id AND owner_id = :owner_id AND is_deleted = FALSE
RETURNING id, owner_id, title, visibility, created_at, updated_at, is_deleted
`;

const DELETE_NOTE_SQL = `
UPDATE notes SET is_deleted = TRUE, updated_at = NOW()
WHERE id = :id AND owner_id = :owner_id
RETURNING id
`;

const CHECK_NOTE_ACCESS_SQL = `
SELECT n.owner_id FROM notes n
LEFT JOIN note_members nm ON nm.note_id = n.id AND nm.member_email = :user_email AND nm.is_deleted = FALSE
WHERE n.id = :note_id AND n.is_deleted = FALSE AND (n.owner_id = :owner_id OR nm.note_id IS NOT NULL)
`;

const CHECK_NOTE_EDITOR_SQL = `
SELECT 1 FROM notes n
LEFT JOIN note_members nm ON nm.note_id = n.id AND nm.member_email = :user_email AND nm.is_deleted = FALSE AND nm.role = 'editor'
WHERE n.id = :note_id AND n.is_deleted = FALSE AND (n.owner_id = :owner_id OR nm.note_id IS NOT NULL)
`;

const MAX_SORT_ORDER_SQL = `
SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM note_pages WHERE note_id = :note_id
`;

const INSERT_NOTE_PAGE_SQL = `
INSERT INTO note_pages (note_id, page_id, added_by_user_id, sort_order)
VALUES (:note_id, :page_id, :added_by_user_id, :sort_order)
ON CONFLICT (note_id, page_id) DO UPDATE SET is_deleted = FALSE, updated_at = NOW(), sort_order = EXCLUDED.sort_order
RETURNING note_id, page_id, sort_order
`;

const INSERT_PAGE_SQL = `
INSERT INTO pages (id, owner_id, title)
VALUES (gen_random_uuid(), :owner_id, COALESCE(NULLIF(TRIM(:title), ''), ''))
RETURNING id, owner_id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted
`;

const REMOVE_NOTE_PAGE_SQL = `
UPDATE note_pages SET is_deleted = TRUE, updated_at = NOW()
WHERE note_id = :note_id AND page_id = :page_id
RETURNING note_id, page_id
`;

const GET_NOTE_MEMBERS_SQL = `
SELECT note_id, member_email, role, invited_by_user_id, created_at, updated_at
FROM note_members WHERE note_id = :note_id AND is_deleted = FALSE
ORDER BY created_at ASC
`;

const INSERT_NOTE_MEMBER_SQL = `
INSERT INTO note_members (note_id, member_email, role, invited_by_user_id)
VALUES (:note_id, :member_email, COALESCE(:role, 'viewer'), :invited_by_user_id)
ON CONFLICT (note_id, member_email) DO UPDATE SET is_deleted = FALSE, role = COALESCE(EXCLUDED.role, note_members.role), updated_at = NOW()
RETURNING note_id, member_email, role, invited_by_user_id, created_at, updated_at
`;

const REMOVE_NOTE_MEMBER_SQL = `
UPDATE note_members SET is_deleted = TRUE, updated_at = NOW()
WHERE note_id = :note_id AND member_email = :member_email
RETURNING note_id, member_email
`;

/**
 * 現在ユーザーの owner_id と email を取得
 * @param {{ sub: string }} claims
 * @returns {Promise<{ ownerId: string; email: string }|null>}
 */
async function getCurrentUser(claims) {
  const sub = claims?.sub;
  if (!sub) return null;
  const rows = await execute(GET_USER_SQL, { cognito_sub: sub });
  const r = rows[0];
  if (!r?.id || !r?.email) return null;
  return { ownerId: r.id, email: String(r.email).trim().toLowerCase() };
}

/**
 * ノートにアクセス可能か（owner または member）
 */
async function canAccessNote(noteId, ownerId, userEmail) {
  const rows = await execute(CHECK_NOTE_ACCESS_SQL, {
    note_id: noteId,
    owner_id: ownerId,
    user_email: userEmail,
  });
  return rows.length > 0;
}

/**
 * ノートを編集可能か（owner または editor メンバー）
 */
async function canEditNote(noteId, ownerId, userEmail) {
  const rows = await execute(CHECK_NOTE_EDITOR_SQL, {
    note_id: noteId,
    owner_id: ownerId,
    user_email: userEmail,
  });
  return rows.length > 0;
}

/**
 * ノートのオーナーか
 */
async function isNoteOwner(noteId, ownerId) {
  const rows = await execute(GET_NOTE_SQL, { id: noteId });
  return rows[0]?.owner_id === ownerId;
}

function rowToNote(row) {
  return {
    id: row.id,
    owner_id: row.owner_id,
    title: row.title ?? null,
    visibility: row.visibility ?? "private",
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_deleted: row.is_deleted === true,
  };
}

function rowToPage(row) {
  return {
    id: row.id,
    owner_id: row.owner_id,
    source_page_id: row.source_page_id ?? null,
    title: row.title ?? null,
    content_preview: row.content_preview ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    source_url: row.source_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_deleted: row.page_is_deleted === true,
    sort_order: row.sort_order ?? 0,
    added_by_user_id: row.added_by_user_id,
    added_at: row.added_at,
  };
}

function rowToMember(row) {
  return {
    note_id: row.note_id,
    member_email: row.member_email,
    role: row.role ?? "viewer",
    invited_by_user_id: row.invited_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * GET /api/notes — 自分がアクセス可能なノート一覧
 */
export async function listNotes(claims) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");

  const rows = await execute(LIST_NOTES_SQL, {
    owner_id: user.ownerId,
    user_email: user.email,
  });
  return res.success(rows.map(rowToNote));
}

/**
 * GET /api/notes/:id — ノート詳細 + ページ一覧
 */
export async function getNote(claims, noteId) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");
  if (!noteId) return res.badRequest("Note id is required");

  const canAccess = await canAccessNote(noteId, user.ownerId, user.email);
  if (!canAccess) return res.notFound("Note not found");

  const noteRows = await execute(GET_NOTE_SQL, { id: noteId });
  const note = noteRows[0];
  if (!note) return res.notFound("Note not found");

  const pageRows = await execute(GET_NOTE_PAGES_SQL, { note_id: noteId });
  return res.success({
    ...rowToNote(note),
    pages: pageRows.map(rowToPage),
  });
}

/**
 * POST /api/notes — ノート作成
 */
export async function createNote(claims, body = {}) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");

  const id = body?.id?.trim() || null;
  const title = body?.title ?? null;
  const visibility = body?.visibility ?? "private";
  const allowed = ["private", "public", "unlisted", "restricted"];
  const vis = allowed.includes(visibility) ? visibility : "private";

  const rows = await execute(INSERT_NOTE_SQL, {
    id: id || undefined,
    owner_id: user.ownerId,
    title: title ?? "",
    visibility: vis,
  });
  const row = rows[0];
  if (!row) return res.error("Create note failed", 500, "DB_ERROR");
  return res.success(rowToNote(row));
}

/**
 * PUT /api/notes/:id — ノート更新（オーナーのみ）
 */
export async function updateNote(claims, noteId, body = {}) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");
  if (!noteId) return res.badRequest("Note id is required");

  const isOwner = await isNoteOwner(noteId, user.ownerId);
  if (!isOwner) return res.forbidden("Only the note owner can update");

  const title = body?.title;
  const visibility = body?.visibility;
  const allowed = ["private", "public", "unlisted", "restricted"];
  const vis = visibility != null && allowed.includes(visibility) ? visibility : undefined;

  const rows = await execute(UPDATE_NOTE_SQL, {
    id: noteId,
    owner_id: user.ownerId,
    title: title !== undefined ? String(title) : undefined,
    visibility: vis,
  });
  if (rows.length === 0) return res.notFound("Note not found");
  return res.success(rowToNote(rows[0]));
}

/**
 * DELETE /api/notes/:id — ノート削除（論理削除、オーナーのみ）
 */
export async function deleteNote(claims, noteId) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");
  if (!noteId) return res.badRequest("Note id is required");

  const rows = await execute(DELETE_NOTE_SQL, { id: noteId, owner_id: user.ownerId });
  if (rows.length === 0) return res.notFound("Note not found");
  return res.success({ id: noteId, deleted: true });
}

/**
 * POST /api/notes/:id/pages — 既存ページ追加 { pageId } または 新規ページ作成 { title }（owner_id = notes.owner_id）
 */
export async function addNotePage(claims, noteId, body = {}) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");
  if (!noteId) return res.badRequest("Note id is required");

  const canEdit = await canEditNote(noteId, user.ownerId, user.email);
  if (!canEdit) return res.forbidden("You do not have permission to add pages to this note");

  const pageId = body?.pageId ?? body?.page_id;
  const title = body?.title;

  if (pageId) {
    // 既存ページをノートに追加
    const nextOrderRows = await execute(MAX_SORT_ORDER_SQL, { note_id: noteId });
    const sortOrder = nextOrderRows[0]?.next_order ?? 0;
    const rows = await execute(INSERT_NOTE_PAGE_SQL, {
      note_id: noteId,
      page_id: pageId,
      added_by_user_id: user.ownerId,
      sort_order: sortOrder,
    });
    if (rows.length === 0) return res.badRequest("Page could not be added (invalid page or duplicate)");
    return res.success(rows[0]);
  }

  if (title !== undefined && title !== null) {
    // ノート内で新規ページ作成（owner_id = notes.owner_id）
    const noteRows = await execute(GET_NOTE_SQL, { id: noteId });
    const note = noteRows[0];
    if (!note) return res.notFound("Note not found");
    const newPageRows = await execute(INSERT_PAGE_SQL, {
      owner_id: note.owner_id,
      title: String(title),
    });
    const newPage = newPageRows[0];
    if (!newPage) return res.error("Create page failed", 500, "DB_ERROR");
    const nextOrderRows = await execute(MAX_SORT_ORDER_SQL, { note_id: noteId });
    const sortOrder = nextOrderRows[0]?.next_order ?? 0;
    await execute(INSERT_NOTE_PAGE_SQL, {
      note_id: noteId,
      page_id: newPage.id,
      added_by_user_id: user.ownerId,
      sort_order: sortOrder,
    });
    return res.success({
      page: rowToPage({ ...newPage, sort_order: sortOrder, added_by_user_id: user.ownerId, added_at: newPage.created_at }),
      created: true,
    });
  }

  return res.badRequest("Provide pageId (existing page) or title (new page)");
}

/**
 * DELETE /api/notes/:id/pages/:pageId — ノートからページを削除（論理削除）
 */
export async function removeNotePage(claims, noteId, pageId) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");
  if (!noteId || !pageId) return res.badRequest("Note id and page id are required");

  const canEdit = await canEditNote(noteId, user.ownerId, user.email);
  if (!canEdit) return res.forbidden("You do not have permission to remove pages from this note");

  const rows = await execute(REMOVE_NOTE_PAGE_SQL, { note_id: noteId, page_id: pageId });
  if (rows.length === 0) return res.notFound("Note page not found");
  return res.success({ note_id: noteId, page_id: pageId, removed: true });
}

/**
 * GET /api/notes/:id/members — メンバー一覧
 */
export async function listNoteMembers(claims, noteId) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");
  if (!noteId) return res.badRequest("Note id is required");

  const canAccess = await canAccessNote(noteId, user.ownerId, user.email);
  if (!canAccess) return res.notFound("Note not found");

  const rows = await execute(GET_NOTE_MEMBERS_SQL, { note_id: noteId });
  return res.success(rows.map(rowToMember));
}

/**
 * POST /api/notes/:id/members — メンバー招待（オーナーのみ）
 */
export async function addNoteMember(claims, noteId, body = {}) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");
  if (!noteId) return res.badRequest("Note id is required");

  const isOwner = await isNoteOwner(noteId, user.ownerId);
  if (!isOwner) return res.forbidden("Only the note owner can invite members");

  const memberEmail = (body?.member_email ?? body?.memberEmail ?? "").trim().toLowerCase();
  if (!memberEmail) return res.badRequest("member_email is required");
  const role = (body?.role ?? "viewer") === "editor" ? "editor" : "viewer";

  const rows = await execute(INSERT_NOTE_MEMBER_SQL, {
    note_id: noteId,
    member_email: memberEmail,
    role,
    invited_by_user_id: user.ownerId,
  });
  if (rows.length === 0) return res.error("Add member failed", 500, "DB_ERROR");
  return res.success(rowToMember(rows[0]));
}

/**
 * DELETE /api/notes/:id/members/:email — メンバー削除（論理削除、オーナーのみ）
 */
export async function removeNoteMember(claims, noteId, memberEmail) {
  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");
  if (!noteId || !memberEmail) return res.badRequest("Note id and member email are required");

  const isOwner = await isNoteOwner(noteId, user.ownerId);
  if (!isOwner) return res.forbidden("Only the note owner can remove members");

  const email = decodeURIComponent(String(memberEmail).trim()).toLowerCase();
  const rows = await execute(REMOVE_NOTE_MEMBER_SQL, { note_id: noteId, member_email: email });
  if (rows.length === 0) return res.notFound("Member not found");
  return res.success({ note_id: noteId, member_email: email, removed: true });
}
