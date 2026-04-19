/**
 * MCP ツール登録
 *
 * `registerAllTools(server, client)` を呼ぶと、Zedi が公開するすべての MCP ツールが登録される。
 * すべてのツールは `ZediClient` インターフェース経由で REST API を呼び出す。
 *
 * Registers all Zedi MCP tools on the given McpServer instance.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ZediClient } from "../client/ZediClient.js";
import { wrapToolHandler, jsonResult } from "./helpers.js";

const NoteVisibilityEnum = z.enum(["private", "public", "unlisted", "restricted"]);
const NoteEditPermissionEnum = z.enum(["owner_only", "members_editors", "any_logged_in"]);
const NoteMemberRoleEnum = z.enum(["viewer", "editor"]);
const SearchScopeEnum = z.enum(["own", "shared"]);

/**
 * 全 MCP ツールを `server` に登録する。
 * Registers every Zedi MCP tool on the given server.
 */
export function registerAllTools(server: McpServer, client: ZediClient): void {
  // ── User ────────────────────────────────────────────────────────────────
  server.registerTool(
    "zedi_get_current_user",
    {
      title: "Get current Zedi user",
      description: "Returns the currently authenticated user's profile (id, email, name).",
      inputSchema: {},
    },
    async () =>
      wrapToolHandler(async () => {
        const user = await client.getCurrentUser();
        return jsonResult(user);
      }, {}),
  );

  // ── Pages ───────────────────────────────────────────────────────────────
  server.registerTool(
    "zedi_list_pages",
    {
      title: "List pages",
      description:
        "Lists the caller's pages, paginated and ordered by `updated_at` DESC. Use `scope: own` for own pages or `shared` to also include pages attached to notes the caller is a member of. Returns `{ id, title, content_preview, updated_at }`.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        scope: SearchScopeEnum.optional(),
      },
    },
    async (args) =>
      wrapToolHandler(async (input) => {
        const pages = await client.listPages(input);
        return jsonResult(pages);
      }, args),
  );

  server.registerTool(
    "zedi_get_page",
    {
      title: "Get page content",
      description:
        "Fetches the Y.Doc state and content_text for a single page. Use this to read a page's body.",
      inputSchema: { page_id: z.string().min(1) },
    },
    async (args) =>
      wrapToolHandler(async ({ page_id }) => {
        const content = await client.getPageContent(page_id);
        return jsonResult(content);
      }, args),
  );

  server.registerTool(
    "zedi_create_page",
    {
      title: "Create page",
      description: "Creates a new empty page (no Y.Doc body). Returns the created page metadata.",
      inputSchema: {
        title: z.string().optional(),
        content_preview: z.string().optional(),
        source_url: z.string().url().optional(),
        thumbnail_url: z.string().url().nullable().optional(),
      },
    },
    async (args) =>
      wrapToolHandler(async (input) => {
        const page = await client.createPage(input);
        return jsonResult(page);
      }, args),
  );

  server.registerTool(
    "zedi_update_page_content",
    {
      title: "Update page content",
      description:
        "Updates a page's Y.Doc state with optimistic locking. `expected_version` must match the current version on the server.",
      inputSchema: {
        page_id: z.string().min(1),
        ydoc_state: z.string().min(1),
        expected_version: z.number().int().nonnegative(),
        content_text: z.string().optional(),
        content_preview: z.string().optional(),
        title: z.string().optional(),
      },
    },
    async (args) =>
      wrapToolHandler(async ({ page_id, ...rest }) => {
        const result = await client.updatePageContent(page_id, rest);
        return jsonResult(result);
      }, args),
  );

  server.registerTool(
    "zedi_delete_page",
    {
      title: "Delete page (soft)",
      description: "Soft-deletes a page. The page is marked as deleted but data is retained.",
      inputSchema: { page_id: z.string().min(1) },
    },
    async (args) =>
      wrapToolHandler(async ({ page_id }) => {
        const result = await client.deletePage(page_id);
        return jsonResult(result);
      }, args),
  );

  // ── Notes ───────────────────────────────────────────────────────────────
  server.registerTool(
    "zedi_list_notes",
    {
      title: "List notes",
      description: "Lists all notes the current user owns or is a member of.",
      inputSchema: {},
    },
    async () =>
      wrapToolHandler(async () => {
        const notes = await client.listNotes();
        return jsonResult(notes);
      }, {}),
  );

  server.registerTool(
    "zedi_get_note",
    {
      title: "Get note",
      description: "Returns a note's details, including its current pages and the caller's role.",
      inputSchema: { note_id: z.string().min(1) },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id }) => {
        const note = await client.getNote(note_id);
        return jsonResult(note);
      }, args),
  );

  server.registerTool(
    "zedi_create_note",
    {
      title: "Create note",
      description: "Creates a new note. Defaults to private visibility and owner-only edit.",
      inputSchema: {
        title: z.string().optional(),
        visibility: NoteVisibilityEnum.optional(),
        edit_permission: NoteEditPermissionEnum.optional(),
        is_official: z.boolean().optional(),
      },
    },
    async (args) =>
      wrapToolHandler(async (input) => {
        const note = await client.createNote(input);
        return jsonResult(note);
      }, args),
  );

  server.registerTool(
    "zedi_update_note",
    {
      title: "Update note",
      description: "Updates a note's metadata (title, visibility, edit permission).",
      inputSchema: {
        note_id: z.string().min(1),
        title: z.string().optional(),
        visibility: NoteVisibilityEnum.optional(),
        edit_permission: NoteEditPermissionEnum.optional(),
        is_official: z.boolean().optional(),
      },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id, ...rest }) => {
        const note = await client.updateNote(note_id, rest);
        return jsonResult(note);
      }, args),
  );

  server.registerTool(
    "zedi_delete_note",
    {
      title: "Delete note (soft)",
      description: "Soft-deletes a note. The note is marked as deleted but data is retained.",
      inputSchema: { note_id: z.string().min(1) },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id }) => {
        const result = await client.deleteNote(note_id);
        return jsonResult(result);
      }, args),
  );

  // ── Note pages ──────────────────────────────────────────────────────────
  server.registerTool(
    "zedi_list_note_pages",
    {
      title: "List pages in a note",
      description: "Lists pages currently attached to a note in their sort order.",
      inputSchema: { note_id: z.string().min(1) },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id }) => jsonResult(await client.listNotePages(note_id)), args),
  );

  server.registerTool(
    "zedi_add_page_to_note",
    {
      title: "Add page to note",
      description:
        "Adds an existing page to a note (by page_id) or creates a new page in the note.",
      inputSchema: {
        note_id: z.string().min(1),
        page_id: z.string().optional(),
        title: z.string().optional(),
        source_url: z.string().url().optional(),
      },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id, ...rest }) => {
        const result = await client.addPageToNote(note_id, rest);
        return jsonResult(result);
      }, args),
  );

  server.registerTool(
    "zedi_remove_page_from_note",
    {
      title: "Remove page from note",
      description:
        "Removes a page from a note. The page itself is not deleted, only the linkage is removed.",
      inputSchema: { note_id: z.string().min(1), page_id: z.string().min(1) },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id, page_id }) => {
        const result = await client.removePageFromNote(note_id, page_id);
        return jsonResult(result);
      }, args),
  );

  server.registerTool(
    "zedi_reorder_note_pages",
    {
      title: "Reorder pages in a note",
      description: "Reorders the pages of a note. `page_ids` must include all current pages.",
      inputSchema: {
        note_id: z.string().min(1),
        page_ids: z.array(z.string().min(1)).min(1),
      },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id, page_ids }) => {
        const result = await client.reorderNotePages(note_id, page_ids);
        return jsonResult(result);
      }, args),
  );

  // ── Note members ────────────────────────────────────────────────────────
  server.registerTool(
    "zedi_list_note_members",
    {
      title: "List note members",
      description: "Lists members of a note, including role and acceptance status.",
      inputSchema: { note_id: z.string().min(1) },
    },
    async (args) =>
      wrapToolHandler(
        async ({ note_id }) => jsonResult(await client.listNoteMembers(note_id)),
        args,
      ),
  );

  server.registerTool(
    "zedi_add_note_member",
    {
      title: "Invite a member to a note",
      description: "Invites a user (by email) to a note with the given role.",
      inputSchema: {
        note_id: z.string().min(1),
        email: z.string().email(),
        role: NoteMemberRoleEnum,
      },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id, email, role }) => {
        const result = await client.addNoteMember(note_id, { email, role });
        return jsonResult(result);
      }, args),
  );

  server.registerTool(
    "zedi_update_note_member",
    {
      title: "Update note member role",
      description: "Updates the role of an existing note member.",
      inputSchema: {
        note_id: z.string().min(1),
        email: z.string().email(),
        role: NoteMemberRoleEnum,
      },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id, email, role }) => {
        const result = await client.updateNoteMember(note_id, email, role);
        return jsonResult(result);
      }, args),
  );

  server.registerTool(
    "zedi_remove_note_member",
    {
      title: "Remove note member",
      description: "Removes a member from a note.",
      inputSchema: { note_id: z.string().min(1), email: z.string().email() },
    },
    async (args) =>
      wrapToolHandler(async ({ note_id, email }) => {
        const result = await client.removeNoteMember(note_id, email);
        return jsonResult(result);
      }, args),
  );

  // ── Search ──────────────────────────────────────────────────────────────
  server.registerTool(
    "zedi_search",
    {
      title: "Full-text search",
      description:
        "Searches pages by title and content. Use `scope: own` for own pages or `shared` to include shared notes.",
      inputSchema: {
        query: z.string().min(1),
        scope: SearchScopeEnum.optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) =>
      wrapToolHandler(async ({ query, scope, limit }) => {
        const results = await client.search(query, scope, limit);
        return jsonResult(results);
      }, args),
  );

  // ── Clip ────────────────────────────────────────────────────────────────
  server.registerTool(
    "zedi_clip_url",
    {
      title: "Clip URL into a new page",
      description:
        "Fetches a public web URL, runs Readability, and creates a new page with the cleaned content.",
      inputSchema: { url: z.string().url() },
    },
    async (args) =>
      wrapToolHandler(async ({ url }) => {
        const result = await client.clipUrl(url);
        return jsonResult(result);
      }, args),
  );
}

/** Zedi MCP サーバーが公開するツール名一覧 (テスト/UI 用)。 / List of all tool names exposed by the Zedi MCP server. */
export const ALL_TOOL_NAMES = [
  "zedi_get_current_user",
  "zedi_list_pages",
  "zedi_get_page",
  "zedi_create_page",
  "zedi_update_page_content",
  "zedi_delete_page",
  "zedi_list_notes",
  "zedi_get_note",
  "zedi_create_note",
  "zedi_update_note",
  "zedi_delete_note",
  "zedi_list_note_pages",
  "zedi_add_page_to_note",
  "zedi_remove_page_from_note",
  "zedi_reorder_note_pages",
  "zedi_list_note_members",
  "zedi_add_note_member",
  "zedi_update_note_member",
  "zedi_remove_note_member",
  "zedi_search",
  "zedi_clip_url",
] as const;
