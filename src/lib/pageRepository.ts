import type { Client } from "@libsql/client";
import type { Page, PageSummary, Link, GhostLink } from "@/types/page";
import { nanoid } from "nanoid";

/**
 * Options for PageRepository
 */
export interface PageRepositoryOptions {
  /**
   * Callback to call after any mutation (create, update, delete)
   * Used for local database persistence
   */
  onMutate?: () => void | Promise<void>;
}

/**
 * Page repository for database operations
 * Works with both Turso (remote) and libsql (local) clients
 */
export class PageRepository {
  private onMutate?: () => void | Promise<void>;

  constructor(private client: Client, options?: PageRepositoryOptions) {
    this.onMutate = options?.onMutate;
  }

  /**
   * Call onMutate callback if provided
   */
  private async notifyMutation(): Promise<void> {
    if (this.onMutate) {
      await this.onMutate();
    }
  }

  /**
   * Create a new page
   */
  async createPage(
    userId: string,
    title: string = "",
    content: string = ""
  ): Promise<Page> {
    const id = nanoid();
    const now = Date.now();

    await this.client.execute({
      sql: `
        INSERT INTO pages (id, user_id, title, content, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `,
      args: [id, userId, title, content, now, now],
    });

    await this.notifyMutation();

    return {
      id,
      title,
      content,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
  }

  /**
   * Get a page by ID
   */
  async getPage(userId: string, pageId: string): Promise<Page | null> {
    const result = await this.client.execute({
      sql: `
        SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
        FROM pages
        WHERE id = ? AND user_id = ? AND is_deleted = 0
      `,
      args: [pageId, userId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.rowToPage(row);
  }

  /**
   * Get all pages for a user (not deleted)
   * WARNING: This fetches content for all pages - use getPagesSummary() for list views
   */
  async getPages(userId: string): Promise<Page[]> {
    const result = await this.client.execute({
      sql: `
        SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
        FROM pages
        WHERE user_id = ? AND is_deleted = 0
        ORDER BY created_at DESC
      `,
      args: [userId],
    });

    return result.rows.map((row) => this.rowToPage(row));
  }

  /**
   * Get all page summaries for a user (without content)
   * Use this for list views to minimize data transfer and reduce Turso Rows Read
   */
  async getPagesSummary(userId: string): Promise<PageSummary[]> {
    const result = await this.client.execute({
      sql: `
        SELECT id, title, thumbnail_url, source_url, created_at, updated_at, is_deleted
        FROM pages
        WHERE user_id = ? AND is_deleted = 0
        ORDER BY created_at DESC
      `,
      args: [userId],
    });

    return result.rows.map((row) => this.rowToPageSummary(row));
  }

  /**
   * Get multiple pages by IDs (with content)
   * Use when you need content for specific pages only
   */
  async getPagesByIds(userId: string, pageIds: string[]): Promise<Page[]> {
    if (pageIds.length === 0) return [];

    const placeholders = pageIds.map(() => "?").join(",");
    const result = await this.client.execute({
      sql: `
        SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
        FROM pages
        WHERE user_id = ? AND id IN (${placeholders}) AND is_deleted = 0
      `,
      args: [userId, ...pageIds],
    });

    return result.rows.map((row) => this.rowToPage(row));
  }

  /**
   * Get a page by title (case-sensitive, trimmed)
   */
  async getPageByTitle(userId: string, title: string): Promise<Page | null> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;

    const result = await this.client.execute({
      sql: `
        SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
        FROM pages
        WHERE user_id = ? AND TRIM(title) = ? AND is_deleted = 0
      `,
      args: [userId, trimmedTitle],
    });

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToPage(result.rows[0]);
  }

  /**
   * Check if a page with the same title exists (excluding a specific page)
   * Used for duplicate title validation
   */
  async checkDuplicateTitle(
    userId: string,
    title: string,
    excludePageId?: string
  ): Promise<Page | null> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;

    let sql = `
      SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
      FROM pages
      WHERE user_id = ? AND TRIM(title) = ? AND is_deleted = 0
    `;
    const args: (string | number)[] = [userId, trimmedTitle];

    if (excludePageId) {
      sql += ` AND id != ?`;
      args.push(excludePageId);
    }

    const result = await this.client.execute({ sql, args });

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToPage(result.rows[0]);
  }

  /**
   * Update a page
   */
  async updatePage(
    userId: string,
    pageId: string,
    updates: Partial<
      Pick<Page, "title" | "content" | "thumbnailUrl" | "sourceUrl">
    >
  ): Promise<void> {
    const setClauses: string[] = ["updated_at = ?"];
    const args: (string | number)[] = [Date.now()];

    if (updates.title !== undefined) {
      setClauses.push("title = ?");
      args.push(updates.title);
    }
    if (updates.content !== undefined) {
      setClauses.push("content = ?");
      args.push(updates.content);
    }
    if (updates.thumbnailUrl !== undefined) {
      setClauses.push("thumbnail_url = ?");
      args.push(updates.thumbnailUrl);
    }
    if (updates.sourceUrl !== undefined) {
      setClauses.push("source_url = ?");
      args.push(updates.sourceUrl);
    }

    args.push(pageId, userId);

    await this.client.execute({
      sql: `
        UPDATE pages
        SET ${setClauses.join(", ")}
        WHERE id = ? AND user_id = ?
      `,
      args,
    });

    await this.notifyMutation();
  }

  /**
   * Soft delete a page
   */
  async deletePage(userId: string, pageId: string): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE pages
        SET is_deleted = 1, updated_at = ?
        WHERE id = ? AND user_id = ?
      `,
      args: [Date.now(), pageId, userId],
    });

    // Remove associated links
    await this.client.execute({
      sql: `DELETE FROM links WHERE source_id = ? OR target_id = ?`,
      args: [pageId, pageId],
    });

    await this.notifyMutation();
  }

  /**
   * Search pages by title and content
   */
  async searchPages(userId: string, query: string): Promise<Page[]> {
    const searchTerm = `%${query.toLowerCase()}%`;

    const result = await this.client.execute({
      sql: `
        SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
        FROM pages
        WHERE user_id = ? AND is_deleted = 0
          AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)
        ORDER BY updated_at DESC
      `,
      args: [userId, searchTerm, searchTerm],
    });

    return result.rows.map((row) => this.rowToPage(row));
  }

  // --- Link operations ---

  /**
   * Add a link between pages
   */
  async addLink(sourceId: string, targetId: string): Promise<void> {
    try {
      await this.client.execute({
        sql: `
          INSERT OR IGNORE INTO links (source_id, target_id, created_at)
          VALUES (?, ?, ?)
        `,
        args: [sourceId, targetId, Date.now()],
      });
      await this.notifyMutation();
    } catch (error) {
      // Ignore duplicate key errors
      console.error("Error adding link:", error);
    }
  }

  /**
   * Remove a link between pages
   */
  async removeLink(sourceId: string, targetId: string): Promise<void> {
    await this.client.execute({
      sql: `DELETE FROM links WHERE source_id = ? AND target_id = ?`,
      args: [sourceId, targetId],
    });
    await this.notifyMutation();
  }

  /**
   * Get outgoing links from a page
   */
  async getOutgoingLinks(pageId: string): Promise<string[]> {
    const result = await this.client.execute({
      sql: `SELECT target_id FROM links WHERE source_id = ?`,
      args: [pageId],
    });

    return result.rows.map((row) => row.target_id as string);
  }

  /**
   * Get backlinks to a page
   */
  async getBacklinks(pageId: string): Promise<string[]> {
    const result = await this.client.execute({
      sql: `SELECT source_id FROM links WHERE target_id = ?`,
      args: [pageId],
    });

    return result.rows.map((row) => row.source_id as string);
  }

  /**
   * Get all links for a user's pages
   */
  async getLinks(userId: string): Promise<Link[]> {
    const result = await this.client.execute({
      sql: `
        SELECT l.source_id, l.target_id, l.created_at
        FROM links l
        INNER JOIN pages p ON l.source_id = p.id
        WHERE p.user_id = ?
      `,
      args: [userId],
    });

    return result.rows.map((row) => ({
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      createdAt: row.created_at as number,
    }));
  }

  // --- Ghost Link operations ---

  /**
   * Add a ghost link
   */
  async addGhostLink(linkText: string, sourcePageId: string): Promise<void> {
    try {
      await this.client.execute({
        sql: `
          INSERT OR IGNORE INTO ghost_links (link_text, source_page_id, created_at)
          VALUES (?, ?, ?)
        `,
        args: [linkText, sourcePageId, Date.now()],
      });
      await this.notifyMutation();
    } catch (error) {
      console.error("Error adding ghost link:", error);
    }
  }

  /**
   * Remove a ghost link
   */
  async removeGhostLink(linkText: string, sourcePageId: string): Promise<void> {
    await this.client.execute({
      sql: `DELETE FROM ghost_links WHERE link_text = ? AND source_page_id = ?`,
      args: [linkText, sourcePageId],
    });
    await this.notifyMutation();
  }

  /**
   * Get all source pages for a ghost link
   */
  async getGhostLinkSources(linkText: string): Promise<string[]> {
    const result = await this.client.execute({
      sql: `SELECT source_page_id FROM ghost_links WHERE link_text = ?`,
      args: [linkText],
    });

    return result.rows.map((row) => row.source_page_id as string);
  }

  /**
   * Get all ghost links for a user
   */
  async getGhostLinks(userId: string): Promise<GhostLink[]> {
    const result = await this.client.execute({
      sql: `
        SELECT gl.link_text, gl.source_page_id, gl.created_at
        FROM ghost_links gl
        INNER JOIN pages p ON gl.source_page_id = p.id
        WHERE p.user_id = ?
      `,
      args: [userId],
    });

    return result.rows.map((row) => ({
      linkText: row.link_text as string,
      sourcePageId: row.source_page_id as string,
      createdAt: row.created_at as number,
    }));
  }

  /**
   * Promote a ghost link to a real page (if referenced from multiple pages)
   */
  async promoteGhostLink(
    userId: string,
    linkText: string
  ): Promise<Page | null> {
    const sources = await this.getGhostLinkSources(linkText);

    if (sources.length >= 2) {
      // Create a new page from the ghost link
      const newPage = await this.createPage(userId, linkText);

      // Convert ghost links to real links
      for (const sourceId of sources) {
        await this.addLink(sourceId, newPage.id);
      }

      // Remove ghost links
      await this.client.execute({
        sql: `DELETE FROM ghost_links WHERE link_text = ?`,
        args: [linkText],
      });

      await this.notifyMutation();

      return newPage;
    }

    return null;
  }

  // --- Helper methods ---

  private rowToPage(row: Record<string, unknown>): Page {
    return {
      id: row.id as string,
      title: (row.title as string) || "",
      content: (row.content as string) || "",
      thumbnailUrl: row.thumbnail_url as string | undefined,
      sourceUrl: row.source_url as string | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      isDeleted: Boolean(row.is_deleted),
    };
  }

  private rowToPageSummary(row: Record<string, unknown>): PageSummary {
    return {
      id: row.id as string,
      title: (row.title as string) || "",
      thumbnailUrl: row.thumbnail_url as string | undefined,
      sourceUrl: row.source_url as string | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      isDeleted: Boolean(row.is_deleted),
    };
  }
}
