/**
 * REST API の in-memory モック（issue #1036）。
 * バックエンド無し環境（Vite dev サーバのみ + VITE_E2E_TEST=true）で E2E を
 * 走らせるため、`/api/` 配下を 1 つの述語ルートでハンドリングする。
 * レスポンスは実 API のワイヤ形式（snake_case）に合わせたフィクスチャを返す。
 * 未対応のパスは 404 を返し `unhandled` に記録する（デバッグ用）。
 *
 * In-memory mock for the REST API (issue #1036). Lets E2E suites run against
 * a backend-less environment (Vite dev server only + VITE_E2E_TEST=true) by
 * handling everything under `/api/` with a single predicate route.
 * Responses follow the real wire format (snake_case). Unhandled paths get a
 * 404 and are recorded in `unhandled` for debugging.
 *
 * 注意: glob `**\/api/**` は Vite のモジュール URL（/src/lib/api/...）にも
 * マッチしてアプリを壊すため、必ず述語形式（url.pathname.startsWith("/api/")）
 * を使うこと。
 * NOTE: the glob `**\/api/**` also matches Vite module URLs
 * (/src/lib/api/...) and breaks the app, so we must use the predicate form
 * (url.pathname.startsWith("/api/")).
 */
import type { Page, Route } from "@playwright/test";
import { randomUUID } from "node:crypto";

/** ページ行のワイヤ形式 / Wire shape of a page row. */
export interface MockPageRow {
  id: string;
  note_id: string;
  owner_id: string;
  title: string;
  content_preview: string;
  thumbnail_url: string | null;
  source_url: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

/** `GET /api/pages/:pageId/public-links` のワイヤ形式 / Wire shape of public-links. */
export interface MockPublicLinks {
  outgoing_links: MockPageRow[];
  backlinks: MockPageRow[];
  ghost_links: string[];
}

export interface MockBackend {
  /** モックが提供する唯一のノートの id / The id of the single note this mock serves. */
  noteId: string;
  /** ページを 1 枚 seed する（page-titles / GET pages に反映）/ Seed one page row. */
  seedPage(init: { id?: string; title?: string }): MockPageRow;
  /** 指定ページの public-links レスポンスを設定する / Set public-links for a page. */
  setPublicLinks(pageId: string, links: Partial<MockPublicLinks>): void;
  /** 404 を返した `METHOD path` の記録（デバッグ用）/ Requests answered with 404. */
  unhandled: string[];
}

const OWNER_ID = "local-user";
const DEFAULT_NOTE_ID = "11111111-1111-4111-8111-111111111111";
/** 決定的なタイムスタンプ / Deterministic timestamp for fixtures. */
const NOW = "2026-06-11T00:00:00.000Z";

const EMPTY_LINKS: MockPublicLinks = {
  outgoing_links: [],
  backlinks: [],
  ghost_links: [],
};

/**
 * `/api/` 配下を全てモックする述語ルートをインストールし、状態操作用の
 * ハンドルを返す。
 * Install the predicate route mocking everything under `/api/` and return a
 * handle for seeding state.
 */
export async function installMockBackend(
  page: Page,
  options: { noteId?: string } = {},
): Promise<MockBackend> {
  const noteId = options.noteId ?? DEFAULT_NOTE_ID;
  const pages = new Map<string, MockPageRow>();
  const publicLinks = new Map<string, MockPublicLinks>();
  const unhandled: string[] = [];

  /** GET /api/notes/* が返すノート行 / Note row served by GET /api/notes/*. */
  const noteRow = () => ({
    id: noteId,
    slug: "me",
    title: "My Note",
    description: null,
    visibility: "private",
    owner_id: OWNER_ID,
    current_user_role: "owner",
    page_count: pages.size,
    created_at: NOW,
    updated_at: NOW,
  });

  function makePage(init: { id?: string; title?: string; note_id?: string }): MockPageRow {
    const row: MockPageRow = {
      id: init.id ?? randomUUID(),
      note_id: init.note_id ?? noteId,
      owner_id: OWNER_ID,
      title: init.title ?? "",
      content_preview: "",
      thumbnail_url: null,
      source_url: null,
      is_deleted: false,
      created_at: NOW,
      updated_at: NOW,
    };
    pages.set(row.id, row);
    return row;
  }

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const { pathname } = new URL(request.url());

      // GET /api/notes/me | GET /api/notes/:noteId — ノート解決（canEdit は
      // current_user_role が根拠）。
      // Resolve the note ("me" alias and by id); canEdit derives from
      // current_user_role.
      if (
        method === "GET" &&
        (pathname === "/api/notes/me" || pathname === `/api/notes/${noteId}`)
      ) {
        return json(route, noteRow());
      }

      // GET /api/notes/:noteId/page-titles — WikiLink / ゴースト補完の候補ソース。
      // Candidate source for WikiLink suggestion / inline ghost completion.
      if (method === "GET" && pathname === `/api/notes/${noteId}/page-titles`) {
        const items = [...pages.values()].map((p) => ({
          id: p.id,
          title: p.title,
          is_deleted: p.is_deleted,
          updated_at: p.updated_at,
        }));
        return json(route, { items });
      }

      // POST /api/pages — ページ作成（FAB / ゴーストカード）。
      // Create a page (home FAB / ghost-link card).
      if (method === "POST" && pathname === "/api/pages") {
        const body = (request.postDataJSON() ?? {}) as { title?: string; note_id?: string };
        const row = makePage({ title: body.title, note_id: body.note_id });
        return json(route, row, 201);
      }

      // POST /api/notes/:noteId/pages — ノートへの付け替え（作成ページの
      // note_id が FAB の noteId と異なる場合のみ呼ばれる）。
      // 実サーバは `page_id` / `pageId` のみ受け付ける（`id` は受けない）ので
      // モックも同じキーだけを見る（issue #1036 アサーション強度レビュー）。
      // Re-attach a page to the note (only fired when note ids differ).
      // The real server accepts only `page_id` / `pageId` (never `id`), so the
      // mock reads exactly those keys (issue #1036 assertion-strength review).
      if (method === "POST" && pathname === `/api/notes/${noteId}/pages`) {
        const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
        const pid = (body.page_id ?? body.pageId) as string | undefined;
        const row = pid ? pages.get(pid) : undefined;
        if (!row) return json(route, { error: "page not found" }, 404);
        row.note_id = noteId;
        return json(route, row);
      }

      // /api/pages/:pageId 系 — 取得 / タイトル更新 / public-links。
      // Page family — fetch / title update / public-links.
      const pageMatch = pathname.match(/^\/api\/pages\/([^/]+)(?:\/(.+))?$/);
      if (pageMatch) {
        const [, pid, rest] = pageMatch;
        const row = pages.get(pid);
        if (rest === "public-links" && method === "GET") {
          // 実サーバ仕様: 存在しないページの public-links は 404（確認済み）。
          // 存在するページでリンク未設定なら全空レスポンス。fail-loud 化により
          // テストが誤った pageId を引いても空レスポンスで silent-pass しない。
          // Real server behaviour (confirmed): public-links for a nonexistent
          // page is 404; an existing page without links gets the all-empty
          // shape. Failing loudly stops tests from silently passing on a
          // wrong pageId.
          if (!row) return json(route, { error: "not found" }, 404);
          return json(route, publicLinks.get(pid) ?? EMPTY_LINKS);
        }
        if (!rest && row && method === "GET") {
          return json(route, row);
        }
        if (!rest && row && method === "PUT") {
          const body = (request.postDataJSON() ?? {}) as Partial<MockPageRow>;
          if (typeof body.title === "string") row.title = body.title;
          return json(route, row);
        }
      }

      // 未対応パスは 404（/api/users/me 等は 404 でも UI は動く: issue #1036 検証済み）。
      // Unhandled paths get 404 (verified safe for /api/users/me etc.).
      unhandled.push(`${method} ${pathname}`);
      return json(route, { error: "not found" }, 404);
    },
  );

  return {
    noteId,
    seedPage: (init) => makePage(init),
    setPublicLinks: (pid, links) => {
      publicLinks.set(pid, { ...EMPTY_LINKS, ...links });
    },
    unhandled,
  };
}
