/**
 * C3-7: Page repository backed by StorageAdapter + ApiClient.
 * Replaces Turso/sql.js for reads and writes. Page "content" is Y.Doc (returned as "").
 */

import type { StorageAdapter } from "@/lib/storageAdapter/StorageAdapter";
import type { PageMetadata } from "@/lib/storageAdapter/types";
import type { ApiClient } from "@/lib/api/apiClient";
import type { Page, PageSummary, Link, GhostLink } from "@/types/page";
import { getPageListPreview } from "@/lib/contentUtils";

function metadataToPage(m: PageMetadata): Page {
  return {
    id: m.id,
    ownerUserId: m.ownerId,
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
    title: m.title ?? "",
    contentPreview: m.contentPreview ?? undefined,
    thumbnailUrl: m.thumbnailUrl ?? undefined,
    sourceUrl: m.sourceUrl ?? undefined,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    isDeleted: m.isDeleted,
  };
}

export class StorageAdapterPageRepository {
  constructor(
    private adapter: StorageAdapter,
    private api: ApiClient,
    private userId: string
  ) {}

  async createPage(
    userId: string,
    title: string = "",
    content: string = ""
  ): Promise<Page> {
    const contentPreview = getPageListPreview(content);
    const created = await this.api.createPage({
      title: title || undefined,
      content_preview: contentPreview || undefined,
    });
    const meta: PageMetadata = {
      id: created.id,
      ownerId: created.owner_id,
      sourcePageId: created.source_page_id ?? null,
      title: created.title ?? null,
      contentPreview: created.content_preview ?? null,
      thumbnailUrl: created.thumbnail_url ?? null,
      sourceUrl: created.source_url ?? null,
      createdAt: new Date(created.created_at).getTime(),
      updatedAt: new Date(created.updated_at).getTime(),
      isDeleted: created.is_deleted === true,
    };
    await this.adapter.upsertPage(meta);
    return metadataToPage(meta);
  }

  async getPage(userId: string, pageId: string): Promise<Page | null> {
    const m = await this.adapter.getPage(pageId);
    return m ? metadataToPage(m) : null;
  }

  async getPages(userId: string): Promise<Page[]> {
    const list = await this.adapter.getAllPages();
    return list.map(metadataToPage);
  }

  async getPagesSummary(userId: string): Promise<PageSummary[]> {
    const list = await this.adapter.getAllPages();
    return list.map(metadataToPageSummary);
  }

  async getPagesByIds(userId: string, pageIds: string[]): Promise<Page[]> {
    if (pageIds.length === 0) return [];
    const list = await this.adapter.getAllPages();
    const idSet = new Set(pageIds);
    return list.filter((m) => idSet.has(m.id)).map(metadataToPage);
  }

  async getPageByTitle(userId: string, title: string): Promise<Page | null> {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const list = await this.adapter.getAllPages();
    const m = list.find((p) => (p.title ?? "").trim() === trimmed);
    return m ? metadataToPage(m) : null;
  }

  async checkDuplicateTitle(
    userId: string,
    title: string,
    excludePageId?: string
  ): Promise<Page | null> {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const list = await this.adapter.getAllPages();
    const m = list.find(
      (p) =>
        (p.title ?? "").trim() === trimmed &&
        (!excludePageId || p.id !== excludePageId)
    );
    return m ? metadataToPage(m) : null;
  }

  async updatePage(
    userId: string,
    pageId: string,
    updates: Partial<Pick<Page, "title" | "content" | "thumbnailUrl" | "sourceUrl">>
  ): Promise<void> {
    const existing = await this.adapter.getPage(pageId);
    if (!existing) return;
    const now = Date.now();
    const meta: PageMetadata = {
      ...existing,
      title: updates.title !== undefined ? updates.title : existing.title,
      contentPreview:
        updates.content !== undefined
          ? getPageListPreview(updates.content)
          : existing.contentPreview,
      thumbnailUrl:
        updates.thumbnailUrl !== undefined
          ? updates.thumbnailUrl
          : existing.thumbnailUrl,
      sourceUrl:
        updates.sourceUrl !== undefined
          ? updates.sourceUrl
          : existing.sourceUrl,
      updatedAt: now,
    };
    await this.adapter.upsertPage(meta);
  }

  async deletePage(userId: string, pageId: string): Promise<void> {
    await this.adapter.deletePage(pageId);
    await this.api.deletePage(pageId);
  }

  async searchPages(userId: string, query: string): Promise<Page[]> {
    const results = await this.adapter.searchPages(query);
    const pages: Page[] = [];
    for (const r of results) {
      const m = await this.adapter.getPage(r.pageId);
      if (m) pages.push(metadataToPage(m));
    }
    return pages;
  }

  async addLink(sourceId: string, targetId: string): Promise<void> {
    const links = await this.adapter.getLinks(sourceId);
    const now = Date.now();
    if (links.some((l) => l.targetId === targetId)) return;
    await this.adapter.saveLinks(sourceId, [
      ...links,
      { sourceId, targetId, createdAt: now },
    ]);
  }

  async removeLink(sourceId: string, targetId: string): Promise<void> {
    const links = await this.adapter.getLinks(sourceId);
    await this.adapter.saveLinks(
      sourceId,
      links.filter((l) => l.targetId !== targetId)
    );
  }

  async getOutgoingLinks(pageId: string): Promise<string[]> {
    const links = await this.adapter.getLinks(pageId);
    return links.map((l) => l.targetId);
  }

  async getBacklinks(pageId: string): Promise<string[]> {
    const links = await this.adapter.getBacklinks(pageId);
    return links.map((l) => l.sourceId);
  }

  async getLinks(userId: string): Promise<Link[]> {
    const pages = await this.adapter.getAllPages();
    const all: Link[] = [];
    for (const p of pages) {
      const links = await this.adapter.getLinks(p.id);
      all.push(...links);
    }
    return all;
  }

  async addGhostLink(linkText: string, sourcePageId: string): Promise<void> {
    const ghosts = await this.adapter.getGhostLinks(sourcePageId);
    const now = Date.now();
    if (ghosts.some((g) => g.linkText === linkText)) return;
    await this.adapter.saveGhostLinks(sourcePageId, [
      ...ghosts,
      { linkText, sourcePageId, createdAt: now },
    ]);
  }

  async removeGhostLink(linkText: string, sourcePageId: string): Promise<void> {
    const ghosts = await this.adapter.getGhostLinks(sourcePageId);
    await this.adapter.saveGhostLinks(
      sourcePageId,
      ghosts.filter((g) => g.linkText !== linkText)
    );
  }

  async getGhostLinkSources(linkText: string): Promise<string[]> {
    const pages = await this.adapter.getAllPages();
    const sources: string[] = [];
    for (const p of pages) {
      const ghosts = await this.adapter.getGhostLinks(p.id);
      if (ghosts.some((g) => g.linkText === linkText)) sources.push(p.id);
    }
    return sources;
  }

  async getGhostLinks(userId: string): Promise<GhostLink[]> {
    const pages = await this.adapter.getAllPages();
    const all: GhostLink[] = [];
    for (const p of pages) {
      const ghosts = await this.adapter.getGhostLinks(p.id);
      all.push(
        ...ghosts.map((g) => ({
          linkText: g.linkText,
          sourcePageId: g.sourcePageId,
          createdAt: g.createdAt,
        }))
      );
    }
    return all;
  }

  async promoteGhostLink(userId: string, linkText: string): Promise<Page | null> {
    const sources = await this.getGhostLinkSources(linkText);
    if (sources.length < 2) return null;
    const newPage = await this.createPage(userId, linkText, "");
    for (const sourceId of sources) {
      await this.addLink(sourceId, newPage.id);
      await this.removeGhostLink(linkText, sourceId);
    }
    return newPage;
  }
}
