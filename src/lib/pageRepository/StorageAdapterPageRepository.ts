/**
 * C3-7: Page repository backed by StorageAdapter + ApiClient.
 * Uses StorageAdapter + API for reads and writes. Page "content" is Y.Doc (returned as "").
 * When userId is LOCAL_USER_ID (guest), create/delete use adapter only (no API).
 */

import type { StorageAdapter } from "@/lib/storageAdapter/StorageAdapter";
import type { PageMetadata } from "@/lib/storageAdapter/types";
import type { ApiClient } from "@/lib/api/apiClient";
import type { SyncPageItem } from "@/lib/api/types";
import type { Page, PageSummary, Link, GhostLink, LinkType } from "@/types/page";
import type { CreatePageOptions } from "@/lib/pageRepository";
import { getPageListPreview, extractPlainText } from "@/lib/contentUtils";

const LOCAL_USER_ID = "local-user";

/**
 * サーバー API の `SyncPageItem` 形のページ行を、ローカル `PageMetadata` に
 * 変換する。作成系 API（`POST /api/pages` / `copy-*`）の成功後に IndexedDB へ
 * 即時書き戻すための共通化。`sync/syncWithApi.ts` の `syncPageToMetadata` と
 * 意味を揃えつつ、こちらはリポジトリ層の write-through 用途なので別物として
 * ローカルに持つ（呼び出し箇所もスコープも違う）。
 *
 * Convert a server-side `SyncPageItem` row into the local `PageMetadata`
 * shape. Used by creation / copy endpoints to write the new page through to
 * IndexedDB immediately. Mirrors `syncPageToMetadata` in `sync/syncWithApi.ts`
 * in intent; kept separate because its caller and scope differ
 * (per-request write-through vs. batch pull).
 */
function syncPageItemToMetadata(row: SyncPageItem): PageMetadata {
  return {
    id: row.id,
    ownerId: row.owner_id,
    noteId: row.note_id ?? null,
    sourcePageId: row.source_page_id ?? null,
    title: row.title ?? null,
    contentPreview: row.content_preview ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    sourceUrl: row.source_url ?? null,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    isDeleted: row.is_deleted === true,
  };
}

function metadataToPage(m: PageMetadata): Page {
  return {
    id: m.id,
    ownerUserId: m.ownerId,
    noteId: m.noteId ?? null,
    title: m.title ?? "",
    content: "", // Y.Doc; load via adapter.getYDocState or API
    contentPreview: m.contentPreview ?? undefined,
    thumbnailUrl: m.thumbnailUrl ?? undefined,
    sourceUrl: m.sourceUrl ?? undefined,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    isDeleted: m.isDeleted,
  };
}

function metadataToPageSummary(m: PageMetadata): PageSummary {
  return {
    id: m.id,
    ownerUserId: m.ownerId,
    noteId: m.noteId ?? null,
    title: m.title ?? "",
    contentPreview: m.contentPreview ?? undefined,
    thumbnailUrl: m.thumbnailUrl ?? undefined,
    sourceUrl: m.sourceUrl ?? undefined,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    isDeleted: m.isDeleted,
  };
}

/**
 * ローカル IndexedDB (StorageAdapter) と REST API (ApiClient) を束ねる
 * ページリポジトリ。ゲスト (`LOCAL_USER_ID`) は adapter のみを使い、
 * 認証済みユーザーは adapter + API の両方を使って CRUD を行う。
 *
 * Page repository that bridges the local IndexedDB (StorageAdapter) with the
 * REST API (ApiClient). Guest users (`LOCAL_USER_ID`) go through the adapter
 * only, while authenticated users read/write via adapter + API.
 */
export class StorageAdapterPageRepository {
  /**
   * @param adapter ローカルストレージ実装 / local storage backend
   * @param api REST API クライアント / REST API client
   */
  constructor(
    private adapter: StorageAdapter,
    private api: ApiClient,
  ) {}

  /**
   * 新しいページを作成する。ゲストはローカルのみ、認証済みは API 経由で作成。
   * Create a new page. Guest users stay local; authenticated users hit the API.
   */
  async createPage(
    userId: string,
    title: string = "",
    content: string = "",
    options?: CreatePageOptions,
  ): Promise<Page> {
    if (userId === LOCAL_USER_ID) {
      return this.createPageLocal(title, content, options);
    }
    return this.createPageRemote(title, content, options);
  }

  private async createPageLocal(
    title: string,
    content: string,
    options?: CreatePageOptions,
  ): Promise<Page> {
    const contentPreview = getPageListPreview(content);
    const now = Date.now();
    const id = crypto.randomUUID();
    const meta: PageMetadata = {
      id,
      ownerId: LOCAL_USER_ID,
      // ローカル (ゲスト) で作るのは個人ページのみ。Issue #713。
      // Local (guest) creation always produces a personal page. Issue #713.
      noteId: null,
      sourcePageId: null,
      title: title || null,
      contentPreview: contentPreview || null,
      thumbnailUrl: options?.thumbnailUrl ?? null,
      sourceUrl: options?.sourceUrl ?? null,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await this.adapter.upsertPage(meta);
    return metadataToPage(meta);
  }

  private async createPageRemote(
    title: string,
    content: string,
    options?: CreatePageOptions,
  ): Promise<Page> {
    const contentPreview = getPageListPreview(content);
    const created = await this.api.createPage({
      title: title || undefined,
      content_preview: contentPreview || undefined,
      source_url: options?.sourceUrl ?? undefined,
      thumbnail_url: options?.thumbnailUrl ?? undefined,
    });
    const meta = syncPageItemToMetadata(created);
    await this.adapter.upsertPage(meta);
    return metadataToPage(meta);
  }

  /**
   * サーバーから取得済みの個人ページ行（`SyncPageItem`）を、API 呼び出しなしで
   * ローカル IndexedDB に書き戻す。「ノート → 個人に取り込み」など、サーバー側で
   * 既に作成済みのページを `/home` へ即時反映させたい場合に使う。
   * `note_id !== null` のノートネイティブページは個人 `/home` のスコープに入れない
   * ため、呼び出し側で弾く（ここでは書き込みを行わず `null` を返す）。
   *
   * Write-through for a page row that was already created on the server.
   * Used after "copy to personal" so the new personal page shows up on `/home`
   * without a full sync. Note-native pages (`note_id !== null`) belong to a
   * note, not the caller's personal `/home`, so they are rejected here (no
   * IDB write; returns `null`). See issue #713 Phase 3.
   */
  async importPersonalPageFromApi(page: SyncPageItem): Promise<Page | null> {
    if (page.note_id != null) return null;
    const meta = syncPageItemToMetadata(page);
    await this.adapter.upsertPage(meta);
    return metadataToPage(meta);
  }

  /**
   * ID 指定で単一ページを取得する（論理削除済みは `null`）。
   * Fetch a single page by ID; `null` if missing or soft-deleted.
   */
  async getPage(_userId: string, pageId: string): Promise<Page | null> {
    const m = await this.adapter.getPage(pageId);
    return m ? metadataToPage(m) : null;
  }

  /**
   * ユーザーの個人ページ一覧を返す（ノートネイティブページは除外）。
   * Return all personal pages for the user (note-native pages excluded).
   */
  async getPages(_userId: string): Promise<Page[]> {
    const list = await this.adapter.getAllPages();
    return list.map(metadataToPage);
  }

  /**
   * 一覧表示用の軽量ページサマリを返す（本文なし、個人ページのみ）。
   * Return lightweight page summaries (no content, personal only) for listing.
   */
  async getPagesSummary(_userId: string): Promise<PageSummary[]> {
    const list = await this.adapter.getAllPages();
    return list.map(metadataToPageSummary);
  }

  /**
   * 複数 ID のページをまとめて取得する。存在しない ID は結果に含まれない。
   * Fetch multiple pages by ID; missing IDs are silently dropped.
   */
  async getPagesByIds(_userId: string, pageIds: string[]): Promise<Page[]> {
    if (pageIds.length === 0) return [];
    const list = await this.adapter.getAllPages();
    const idSet = new Set(pageIds);
    return list.filter((m) => idSet.has(m.id)).map(metadataToPage);
  }

  /**
   * タイトル完全一致でページを 1 件検索する。
   * Find one page by exact title match.
   */
  async getPageByTitle(_userId: string, title: string): Promise<Page | null> {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const list = await this.adapter.getAllPages();
    const m = list.find((p) => (p.title ?? "").trim() === trimmed);
    return m ? metadataToPage(m) : null;
  }

  /**
   * `excludePageId` 以外で同一タイトルのページが存在するか検査する。
   * Return a page with the same title (excluding `excludePageId`), or `null`.
   */
  async checkDuplicateTitle(
    _userId: string,
    title: string,
    excludePageId?: string,
  ): Promise<Page | null> {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const list = await this.adapter.getAllPages();
    const m = list.find(
      (p) => (p.title ?? "").trim() === trimmed && (!excludePageId || p.id !== excludePageId),
    );
    return m ? metadataToPage(m) : null;
  }

  /**
   * ページメタデータ (title / content / thumbnail / sourceUrl) を更新し、
   * 検索インデックスもタイトル・本文変更時は更新する。
   *
   * Update page metadata and refresh the search index when title/content change.
   */
  async updatePage(
    _userId: string,
    pageId: string,
    updates: Partial<Pick<Page, "title" | "content" | "thumbnailUrl" | "sourceUrl">>,
  ): Promise<void> {
    const existing = await this.adapter.getPage(pageId);
    if (!existing) return;
    // issue #768 safety net: 論理削除済みページに対する update は no-op。
    // 現在の `adapter.getPage` は `isDeleted: true` を null として返すので
    // 上の早期 return で実質カバーされているが、将来 `getPage` が tombstone も
    // 返す仕様に変わったときに削除済み行を復活させないための明示ガード。
    //
    // issue #768 safety net: skip updates targeting a soft-deleted page.
    // Today `adapter.getPage` already filters out `isDeleted: true` rows so
    // the early return above covers it, but this explicit guard keeps the
    // contract intact if `getPage` ever starts surfacing tombstones.
    if (existing.isDeleted) return;
    const now = Date.now();
    const meta: PageMetadata = {
      ...existing,
      title: updates.title !== undefined ? updates.title : existing.title,
      contentPreview:
        updates.content !== undefined
          ? getPageListPreview(updates.content)
          : existing.contentPreview,
      thumbnailUrl:
        updates.thumbnailUrl !== undefined ? updates.thumbnailUrl : existing.thumbnailUrl,
      sourceUrl: updates.sourceUrl !== undefined ? updates.sourceUrl : existing.sourceUrl,
      updatedAt: now,
    };
    await this.adapter.upsertPage(meta);
    // タイトルまたはコンテンツが変更された場合、検索インデックスを更新
    if (updates.title !== undefined || updates.content !== undefined) {
      const titleText = meta.title ?? "";
      const contentText = updates.content ? extractPlainText(updates.content) : "";
      const searchText = [titleText, contentText].filter(Boolean).join(" ");
      await this.adapter.updateSearchIndex(pageId, searchText);
    }
  }

  /**
   * ページを論理削除する。認証済みユーザーは API 経由でも削除を通知。
   * Soft-delete a page; authenticated users also notify the API.
   */
  async deletePage(userId: string, pageId: string): Promise<void> {
    await this.adapter.deletePage(pageId);
    if (userId !== LOCAL_USER_ID) {
      await this.api.deletePage(pageId);
    }
  }

  /**
   * ローカルの検索インデックス越しにページを全文検索する。
   * Full-text search over the local search index.
   */
  async searchPages(_userId: string, query: string): Promise<Page[]> {
    const results = await this.adapter.searchPages(query);
    const pages: Page[] = [];
    for (const r of results) {
      const m = await this.adapter.getPage(r.pageId);
      if (m) pages.push(metadataToPage(m));
    }
    return pages;
  }

  /**
   * 2 ページ間のリンクを追加する（重複追加はスキップ）。
   * `linkType` 省略時は `'wiki'`（issue #725 Phase 1）。
   *
   * Add a link between two pages; duplicate inserts are a no-op. Defaults
   * `linkType` to `'wiki'` for legacy call sites.
   */
  async addLink(sourceId: string, targetId: string, linkType: LinkType = "wiki"): Promise<void> {
    const links = await this.adapter.getLinks(sourceId, linkType);
    const now = Date.now();
    if (links.some((l) => l.targetId === targetId)) return;
    await this.adapter.saveLinks(
      sourceId,
      [...links, { sourceId, targetId, linkType, createdAt: now }],
      linkType,
    );
  }

  /**
   * 2 ページ間のリンクを削除する。
   * Remove a link between two pages. `linkType` scopes the removal.
   */
  async removeLink(sourceId: string, targetId: string, linkType: LinkType = "wiki"): Promise<void> {
    const links = await this.adapter.getLinks(sourceId, linkType);
    await this.adapter.saveLinks(
      sourceId,
      links.filter((l) => l.targetId !== targetId),
      linkType,
    );
  }

  /**
   * 指定ページから出ているリンクの target ID 一覧を返す。
   * Return target IDs of outgoing links for a page. `linkType` scopes results.
   */
  async getOutgoingLinks(pageId: string, linkType: LinkType = "wiki"): Promise<string[]> {
    const links = await this.adapter.getLinks(pageId, linkType);
    return links.map((l) => l.targetId);
  }

  /**
   * 指定ページへの被リンク（バックリンク）の source ID 一覧を返す。
   * Return source IDs of backlinks pointing at the page.
   */
  async getBacklinks(pageId: string, linkType: LinkType = "wiki"): Promise<string[]> {
    const links = await this.adapter.getBacklinks(pageId, linkType);
    return links.map((l) => l.sourceId);
  }

  /**
   * ユーザー配下の全ページに対する全リンクを集めて返す（全種別）。
   * Collect every link across all pages owned by the user (all link types).
   */
  async getLinks(_userId: string): Promise<Link[]> {
    const pages = await this.adapter.getAllPages();
    const all: Link[] = [];
    for (const p of pages) {
      const links = await this.adapter.getLinks(p.id);
      all.push(...links);
    }
    return all;
  }

  /**
   * ゴーストリンク（未解決 WikiLink / タグ）を追加する。重複は無視。
   * Add a ghost link (unresolved WikiLink or tag); duplicates are ignored.
   */
  async addGhostLink(
    linkText: string,
    sourcePageId: string,
    linkType: LinkType = "wiki",
  ): Promise<void> {
    const ghosts = await this.adapter.getGhostLinks(sourcePageId, linkType);
    const now = Date.now();
    if (ghosts.some((g) => g.linkText === linkText)) return;
    await this.adapter.saveGhostLinks(
      sourcePageId,
      [...ghosts, { linkText, sourcePageId, linkType, createdAt: now }],
      linkType,
    );
  }

  /**
   * ゴーストリンクを削除する。
   * Remove a ghost link from a source page, scoped by `linkType`.
   */
  async removeGhostLink(
    linkText: string,
    sourcePageId: string,
    linkType: LinkType = "wiki",
  ): Promise<void> {
    const ghosts = await this.adapter.getGhostLinks(sourcePageId, linkType);
    await this.adapter.saveGhostLinks(
      sourcePageId,
      ghosts.filter((g) => g.linkText !== linkText),
      linkType,
    );
  }

  /**
   * 指定リンクテキストのゴーストを持つページ ID 一覧を返す。
   * Return IDs of pages that carry a ghost link for the given text.
   */
  async getGhostLinkSources(linkText: string, linkType: LinkType = "wiki"): Promise<string[]> {
    const pages = await this.adapter.getAllPages();
    const sources: string[] = [];
    for (const p of pages) {
      const ghosts = await this.adapter.getGhostLinks(p.id, linkType);
      if (ghosts.some((g) => g.linkText === linkText)) sources.push(p.id);
    }
    return sources;
  }

  /**
   * ユーザー配下の全ページについて全種別のゴーストリンクを集めて返す。
   * Aggregate every ghost link (all link types) across pages owned by the user.
   */
  async getGhostLinks(_userId: string): Promise<GhostLink[]> {
    const pages = await this.adapter.getAllPages();
    const all: GhostLink[] = [];
    for (const p of pages) {
      const ghosts = await this.adapter.getGhostLinks(p.id);
      all.push(...ghosts);
    }
    return all;
  }

  /**
   * 単一ソースページに属するゴーストリンクのリンクテキスト一覧を返す（差分同期用）。
   * Return ghost-link texts for a single source page (used by delta sync).
   */
  async getGhostLinksBySourcePage(
    sourcePageId: string,
    linkType: LinkType = "wiki",
  ): Promise<string[]> {
    const ghosts = await this.adapter.getGhostLinks(sourcePageId, linkType);
    return ghosts.map((g) => g.linkText);
  }

  /**
   * 2 箇所以上から参照されているゴーストリンクを、実在ページとして昇格させる。
   * 新規ページを作成し、各ソースからのリンクへ置き換える。WikiLink 種別限定。
   *
   * Promote a WikiLink ghost link referenced by two or more source pages into
   * a real page, rewiring each source to link into the new page. Tag ghosts
   * stay as-is (tag promotion is handled via normal tag sync, not multi-source
   * promotion).
   */
  async promoteGhostLink(userId: string, linkText: string): Promise<Page | null> {
    const sources = await this.getGhostLinkSources(linkText, "wiki");
    if (sources.length < 2) return null;
    const newPage = await this.createPage(userId, linkText, "");
    for (const sourceId of sources) {
      await this.addLink(sourceId, newPage.id, "wiki");
      await this.removeGhostLink(linkText, sourceId, "wiki");
    }
    return newPage;
  }
}
