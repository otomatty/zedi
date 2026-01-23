import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import type { Page, PageSummary } from "@/types/page";
import type {
  Note,
  NoteAccess,
  NoteAccessRole,
  NoteMember,
  NoteMemberRole,
  NoteSummary,
  NoteVisibility,
} from "@/types/note";

export interface NoteRepositoryOptions {
  onMutate?: () => void | Promise<void>;
}

export class NoteRepository {
  private onMutate?: () => void | Promise<void>;

  constructor(private client: Client, options?: NoteRepositoryOptions) {
    this.onMutate = options?.onMutate;
  }

  private async notifyMutation(): Promise<void> {
    if (this.onMutate) {
      await this.onMutate();
    }
  }

  private rowToNote(row: Record<string, unknown>): Note {
    return {
      id: row.id as string,
      ownerUserId: row.owner_user_id as string,
      title: (row.title as string) || "",
      visibility: row.visibility as NoteVisibility,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      isDeleted: Boolean(row.is_deleted),
    };
  }

  private rowToNoteSummary(
    row: Record<string, unknown>,
    role: NoteAccessRole
  ): NoteSummary {
    return {
      ...this.rowToNote(row),
      role,
      pageCount: Number(row.page_count ?? 0),
      memberCount: Number(row.member_count ?? 0),
    };
  }

  private rowToPage(row: Record<string, unknown>): Page {
    return {
      id: row.id as string,
      ownerUserId: row.user_id as string | undefined,
      title: (row.title as string) || "",
      content: (row.content as string) || "",
      contentPreview: row.content_preview as string | undefined,
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
      ownerUserId: row.user_id as string | undefined,
      title: (row.title as string) || "",
      contentPreview: row.content_preview as string | undefined,
      thumbnailUrl: row.thumbnail_url as string | undefined,
      sourceUrl: row.source_url as string | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      isDeleted: Boolean(row.is_deleted),
    };
  }

  private async getMemberRole(
    noteId: string,
    userEmail?: string
  ): Promise<NoteMemberRole | null> {
    if (!userEmail) return null;

    const result = await this.client.execute({
      sql: `
        SELECT role
        FROM note_members
        WHERE note_id = ? AND member_email = ? AND is_deleted = 0
      `,
      args: [noteId, userEmail],
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].role as NoteMemberRole;
  }

  private buildAccess(
    note: Note,
    userId?: string,
    memberRole?: NoteMemberRole | null
  ): NoteAccess {
    const isOwner = Boolean(userId && note.ownerUserId === userId);
    const isPublic = note.visibility === "public";
    const isUnlisted = note.visibility === "unlisted";
    const isRestricted = note.visibility === "restricted";

    const canView =
      isPublic ||
      isUnlisted ||
      (isRestricted && (isOwner || Boolean(memberRole))) ||
      (note.visibility === "private" && isOwner);

    let role: NoteAccessRole = "none";
    if (isOwner) {
      role = "owner";
    } else if (memberRole) {
      role = memberRole;
    } else if (canView) {
      role = "guest";
    }

    return {
      role,
      visibility: note.visibility,
      canView,
      canEdit: isOwner || memberRole === "editor",
      canManageMembers: isOwner,
    };
  }

  private async touchNote(noteId: string): Promise<void> {
    await this.client.execute({
      sql: `UPDATE notes SET updated_at = ? WHERE id = ?`,
      args: [Date.now(), noteId],
    });
  }

  async createNote(
    ownerUserId: string,
    title: string,
    visibility: NoteVisibility,
    ownerEmail?: string
  ): Promise<Note> {
    const id = nanoid();
    const now = Date.now();

    await this.client.execute({
      sql: `
        INSERT INTO notes (id, owner_user_id, title, visibility, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `,
      args: [id, ownerUserId, title, visibility, now, now],
    });

    if (ownerEmail) {
      await this.client.execute({
        sql: `
          INSERT OR REPLACE INTO note_members
          (note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `,
        args: [id, ownerEmail, "editor", ownerUserId, now, now],
      });
    }

    await this.notifyMutation();

    return {
      id,
      ownerUserId,
      title,
      visibility,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
  }

  async ensureOwnerMember(
    noteId: string,
    ownerUserId: string,
    ownerEmail?: string
  ): Promise<boolean> {
    if (!ownerEmail) return false;

    const existing = await this.client.execute({
      sql: `
        SELECT role, is_deleted
        FROM note_members
        WHERE note_id = ? AND member_email = ?
      `,
      args: [noteId, ownerEmail],
    });

    if (
      existing.rows.length > 0 &&
      Number(existing.rows[0]?.is_deleted ?? 0) === 0
    ) {
      return false;
    }

    const now = Date.now();
    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO note_members
        (note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `,
      args: [noteId, ownerEmail, "editor", ownerUserId, now, now],
    });

    await this.touchNote(noteId);
    await this.notifyMutation();
    return true;
  }

  async updateNote(
    ownerUserId: string,
    noteId: string,
    updates: Partial<Pick<Note, "title" | "visibility">>,
    ownerEmail?: string
  ): Promise<void> {
    const setClauses: string[] = ["updated_at = ?"];
    const args: (string | number)[] = [Date.now()];

    if (updates.title !== undefined) {
      setClauses.push("title = ?");
      args.push(updates.title);
    }
    if (updates.visibility !== undefined) {
      setClauses.push("visibility = ?");
      args.push(updates.visibility);
    }

    args.push(noteId, ownerUserId);

    await this.client.execute({
      sql: `
        UPDATE notes
        SET ${setClauses.join(", ")}
        WHERE id = ? AND owner_user_id = ? AND is_deleted = 0
      `,
      args,
    });

    if (updates.visibility === "private") {
      if (ownerEmail) {
        await this.client.execute({
          sql: `
            DELETE FROM note_members
            WHERE note_id = ? AND member_email != ?
          `,
          args: [noteId, ownerEmail],
        });

        const now = Date.now();
        await this.client.execute({
          sql: `
            INSERT OR REPLACE INTO note_members
            (note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, 0)
          `,
          args: [noteId, ownerEmail, "editor", ownerUserId, now, now],
        });
      } else {
        await this.client.execute({
          sql: `DELETE FROM note_members WHERE note_id = ?`,
          args: [noteId],
        });
      }
    }

    await this.notifyMutation();
  }

  async deleteNote(ownerUserId: string, noteId: string): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE notes
        SET is_deleted = 1, updated_at = ?
        WHERE id = ? AND owner_user_id = ?
      `,
      args: [Date.now(), noteId, ownerUserId],
    });

    await this.notifyMutation();
  }

  async getNote(noteId: string): Promise<Note | null> {
    const result = await this.client.execute({
      sql: `
        SELECT id, owner_user_id, title, visibility, created_at, updated_at, is_deleted
        FROM notes
        WHERE id = ? AND is_deleted = 0
      `,
      args: [noteId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToNote(result.rows[0]);
  }

  async getNoteWithAccess(
    noteId: string,
    userId?: string,
    userEmail?: string
  ): Promise<{ note: Note; access: NoteAccess } | null> {
    const note = await this.getNote(noteId);
    if (!note) return null;

    const memberRole = await this.getMemberRole(noteId, userEmail);
    const access = this.buildAccess(note, userId, memberRole);

    if (!access.canView) {
      return null;
    }

    return { note, access };
  }

  async getNotesSummary(
    userId: string,
    userEmail?: string
  ): Promise<NoteSummary[]> {
    const args: Array<string | number> = [];
    const joinClause = userEmail
      ? `LEFT JOIN note_members nm
          ON nm.note_id = n.id
          AND nm.is_deleted = 0
          AND nm.member_email = ?`
      : "";

    if (userEmail) {
      args.push(userEmail);
    }

    const whereClause = userEmail
      ? `n.owner_user_id = ? OR nm.note_id IS NOT NULL`
      : `n.owner_user_id = ?`;

    args.push(userId);

    const result = await this.client.execute({
      sql: `
        SELECT
          n.id,
          n.owner_user_id,
          n.title,
          n.visibility,
          n.created_at,
          n.updated_at,
          n.is_deleted,
          nm.role as member_role,
          (
            SELECT COUNT(*) FROM note_pages np
            WHERE np.note_id = n.id AND np.is_deleted = 0
          ) as page_count,
          (
            SELECT COUNT(*) FROM note_members nm2
            WHERE nm2.note_id = n.id AND nm2.is_deleted = 0
          ) as member_count
        FROM notes n
        ${joinClause}
        WHERE n.is_deleted = 0 AND (${whereClause})
        ORDER BY n.updated_at DESC
      `,
      args,
    });

    return result.rows.map((row) => {
      const isOwner = row.owner_user_id === userId;
      const memberRole = row.member_role as NoteMemberRole | undefined;
      let role: NoteAccessRole = "none";

      if (isOwner) {
        role = "owner";
      } else if (memberRole) {
        role = memberRole;
      }

      return this.rowToNoteSummary(row, role);
    });
  }

  async getNotePagesSummary(noteId: string): Promise<PageSummary[]> {
    const result = await this.client.execute({
      sql: `
        SELECT
          p.id,
          p.user_id,
          p.title,
          p.content_preview,
          p.thumbnail_url,
          p.source_url,
          p.created_at,
          p.updated_at,
          p.is_deleted
        FROM note_pages np
        INNER JOIN pages p ON p.id = np.page_id
        WHERE np.note_id = ? AND np.is_deleted = 0 AND p.is_deleted = 0
        ORDER BY np.created_at ASC
      `,
      args: [noteId],
    });

    return result.rows.map((row) => this.rowToPageSummary(row));
  }

  async getNotePage(noteId: string, pageId: string): Promise<Page | null> {
    const result = await this.client.execute({
      sql: `
        SELECT
          p.id,
          p.user_id,
          p.title,
          p.content,
          p.content_preview,
          p.thumbnail_url,
          p.source_url,
          p.created_at,
          p.updated_at,
          p.is_deleted
        FROM note_pages np
        INNER JOIN pages p ON p.id = np.page_id
        WHERE np.note_id = ? AND np.page_id = ? AND np.is_deleted = 0 AND p.is_deleted = 0
      `,
      args: [noteId, pageId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToPage(result.rows[0]);
  }

  async addPageToNote(
    noteId: string,
    pageId: string,
    addedByUserId: string
  ): Promise<void> {
    const now = Date.now();

    await this.client.execute({
      sql: `
        INSERT INTO note_pages (note_id, page_id, added_by_user_id, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, 0)
        ON CONFLICT(note_id, page_id) DO UPDATE SET
          added_by_user_id = excluded.added_by_user_id,
          updated_at = excluded.updated_at,
          is_deleted = 0
      `,
      args: [noteId, pageId, addedByUserId, now, now],
    });

    await this.touchNote(noteId);
    await this.notifyMutation();
  }

  async removePageFromNote(noteId: string, pageId: string): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE note_pages
        SET is_deleted = 1, updated_at = ?
        WHERE note_id = ? AND page_id = ?
      `,
      args: [Date.now(), noteId, pageId],
    });

    await this.touchNote(noteId);
    await this.notifyMutation();
  }

  async getNoteMembers(noteId: string): Promise<NoteMember[]> {
    const result = await this.client.execute({
      sql: `
        SELECT note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted
        FROM note_members
        WHERE note_id = ? AND is_deleted = 0
        ORDER BY created_at ASC
      `,
      args: [noteId],
    });

    return result.rows.map((row) => ({
      noteId: row.note_id as string,
      memberEmail: row.member_email as string,
      role: row.role as NoteMemberRole,
      invitedByUserId: row.invited_by_user_id as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      isDeleted: Boolean(row.is_deleted),
    }));
  }

  async addNoteMember(
    noteId: string,
    memberEmail: string,
    role: NoteMemberRole,
    invitedByUserId: string
  ): Promise<void> {
    const now = Date.now();

    await this.client.execute({
      sql: `
        INSERT INTO note_members (note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(note_id, member_email) DO UPDATE SET
          role = excluded.role,
          updated_at = excluded.updated_at,
          is_deleted = 0
      `,
      args: [noteId, memberEmail, role, invitedByUserId, now, now],
    });

    await this.touchNote(noteId);
    await this.notifyMutation();
  }

  async updateNoteMemberRole(
    noteId: string,
    memberEmail: string,
    role: NoteMemberRole
  ): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE note_members
        SET role = ?, updated_at = ?
        WHERE note_id = ? AND member_email = ? AND is_deleted = 0
      `,
      args: [role, Date.now(), noteId, memberEmail],
    });

    await this.touchNote(noteId);
    await this.notifyMutation();
  }

  async removeNoteMember(noteId: string, memberEmail: string): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE note_members
        SET is_deleted = 1, updated_at = ?
        WHERE note_id = ? AND member_email = ?
      `,
      args: [Date.now(), noteId, memberEmail],
    });

    await this.touchNote(noteId);
    await this.notifyMutation();
  }
}
