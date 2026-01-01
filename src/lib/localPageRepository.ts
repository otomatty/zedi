import type { Database } from "sql.js";
import type { Page, Link, GhostLink } from "@/types/page";
import { nanoid } from "nanoid";
import { saveDatabase } from "./localDatabase";

/**
 * Local Page repository for sql.js database operations
 */
export class LocalPageRepository {
  constructor(private db: Database) {}

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

    this.db.run(
      `INSERT INTO pages (id, user_id, title, content, created_at, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [id, userId, title, content, now, now]
    );

    await saveDatabase(this.db);

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
    const stmt = this.db.prepare(
      `SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
       FROM pages
       WHERE id = ? AND user_id = ? AND is_deleted = 0`
    );
    stmt.bind([pageId, userId]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.rowToPage(row);
    }

    stmt.free();
    return null;
  }

  /**
   * Get all pages for a user (not deleted)
   */
  async getPages(userId: string): Promise<Page[]> {
    const stmt = this.db.prepare(
      `SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
       FROM pages
       WHERE user_id = ? AND is_deleted = 0
       ORDER BY created_at DESC`
    );
    stmt.bind([userId]);

    const pages: Page[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      pages.push(this.rowToPage(row));
    }
    stmt.free();

    return pages;
  }

  /**
   * Get a page by title (case-sensitive, trimmed)
   */
  async getPageByTitle(userId: string, title: string): Promise<Page | null> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;

    const stmt = this.db.prepare(
      `SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
       FROM pages
       WHERE user_id = ? AND TRIM(title) = ? AND is_deleted = 0`
    );
    stmt.bind([userId, trimmedTitle]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.rowToPage(row);
    }

    stmt.free();
    return null;
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

    let sql = `SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
       FROM pages
       WHERE user_id = ? AND TRIM(title) = ? AND is_deleted = 0`;
    const args: (string | number | null)[] = [userId, trimmedTitle];

    if (excludePageId) {
      sql += ` AND id != ?`;
      args.push(excludePageId);
    }

    const stmt = this.db.prepare(sql);
    stmt.bind(args);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.rowToPage(row);
    }

    stmt.free();
    return null;
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

    this.db.run(
      `UPDATE pages SET ${setClauses.join(", ")} WHERE id = ? AND user_id = ?`,
      args
    );

    await saveDatabase(this.db);
  }

  /**
   * Soft delete a page
   */
  async deletePage(userId: string, pageId: string): Promise<void> {
    this.db.run(
      `UPDATE pages SET is_deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?`,
      [Date.now(), pageId, userId]
    );

    // Remove associated links
    this.db.run(`DELETE FROM links WHERE source_id = ? OR target_id = ?`, [
      pageId,
      pageId,
    ]);

    await saveDatabase(this.db);
  }

  /**
   * Search pages by title and content
   */
  async searchPages(userId: string, query: string): Promise<Page[]> {
    const searchTerm = `%${query.toLowerCase()}%`;

    const stmt = this.db.prepare(
      `SELECT id, title, content, thumbnail_url, source_url, created_at, updated_at, is_deleted
       FROM pages
       WHERE user_id = ? AND is_deleted = 0
         AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)
       ORDER BY updated_at DESC`
    );
    stmt.bind([userId, searchTerm, searchTerm]);

    const pages: Page[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      pages.push(this.rowToPage(row));
    }
    stmt.free();

    return pages;
  }

  // --- Link operations ---

  /**
   * Add a link between pages
   */
  async addLink(sourceId: string, targetId: string): Promise<void> {
    try {
      this.db.run(
        `INSERT OR IGNORE INTO links (source_id, target_id, created_at) VALUES (?, ?, ?)`,
        [sourceId, targetId, Date.now()]
      );
      await saveDatabase(this.db);
    } catch (error) {
      console.error("Error adding link:", error);
    }
  }

  /**
   * Remove a link between pages
   */
  async removeLink(sourceId: string, targetId: string): Promise<void> {
    this.db.run(`DELETE FROM links WHERE source_id = ? AND target_id = ?`, [
      sourceId,
      targetId,
    ]);
    await saveDatabase(this.db);
  }

  /**
   * Get outgoing links from a page
   */
  async getOutgoingLinks(pageId: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT target_id FROM links WHERE source_id = ?`
    );
    stmt.bind([pageId]);

    const links: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      links.push(row.target_id as string);
    }
    stmt.free();

    return links;
  }

  /**
   * Get backlinks to a page
   */
  async getBacklinks(pageId: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT source_id FROM links WHERE target_id = ?`
    );
    stmt.bind([pageId]);

    const links: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      links.push(row.source_id as string);
    }
    stmt.free();

    return links;
  }

  /**
   * Get all links for a user's pages
   */
  async getLinks(userId: string): Promise<Link[]> {
    const stmt = this.db.prepare(
      `SELECT l.source_id, l.target_id, l.created_at
       FROM links l
       INNER JOIN pages p ON l.source_id = p.id
       WHERE p.user_id = ?`
    );
    stmt.bind([userId]);

    const links: Link[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      links.push({
        sourceId: row.source_id as string,
        targetId: row.target_id as string,
        createdAt: row.created_at as number,
      });
    }
    stmt.free();

    return links;
  }

  // --- Ghost Link operations ---

  /**
   * Add a ghost link
   */
  async addGhostLink(linkText: string, sourcePageId: string): Promise<void> {
    try {
      this.db.run(
        `INSERT OR IGNORE INTO ghost_links (link_text, source_page_id, created_at) VALUES (?, ?, ?)`,
        [linkText, sourcePageId, Date.now()]
      );
      await saveDatabase(this.db);
    } catch (error) {
      console.error("Error adding ghost link:", error);
    }
  }

  /**
   * Remove a ghost link
   */
  async removeGhostLink(linkText: string, sourcePageId: string): Promise<void> {
    this.db.run(
      `DELETE FROM ghost_links WHERE link_text = ? AND source_page_id = ?`,
      [linkText, sourcePageId]
    );
    await saveDatabase(this.db);
  }

  /**
   * Get all source pages for a ghost link
   */
  async getGhostLinkSources(linkText: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT source_page_id FROM ghost_links WHERE link_text = ?`
    );
    stmt.bind([linkText]);

    const sources: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      sources.push(row.source_page_id as string);
    }
    stmt.free();

    return sources;
  }

  /**
   * Get all ghost links for a user
   */
  async getGhostLinks(userId: string): Promise<GhostLink[]> {
    const stmt = this.db.prepare(
      `SELECT gl.link_text, gl.source_page_id, gl.created_at
       FROM ghost_links gl
       INNER JOIN pages p ON gl.source_page_id = p.id
       WHERE p.user_id = ?`
    );
    stmt.bind([userId]);

    const ghostLinks: GhostLink[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      ghostLinks.push({
        linkText: row.link_text as string,
        sourcePageId: row.source_page_id as string,
        createdAt: row.created_at as number,
      });
    }
    stmt.free();

    return ghostLinks;
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
      this.db.run(`DELETE FROM ghost_links WHERE link_text = ?`, [linkText]);
      await saveDatabase(this.db);

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
}
