import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { Page, Link, GhostLink } from "@/types/page";

/**
 * ゲストセッション向けのインメモリページストアのインターフェース。
 * 認証済みユーザーの正規パスは `StorageAdapterPageRepository` 側。
 *
 * Shape of the in-memory page store used by guest sessions. Authenticated
 * users go through `StorageAdapterPageRepository` instead.
 */
interface PageStore {
  pages: Page[];
  links: Link[];
  ghostLinks: GhostLink[];

  // Page CRUD
  createPage: (title?: string, content?: string) => Page;
  updatePage: (
    id: string,
    updates: Partial<Pick<Page, "title" | "content" | "thumbnailUrl">>,
  ) => void;
  deletePage: (id: string) => void;
  getPage: (id: string) => Page | undefined;
  getPageByTitle: (title: string) => Page | undefined;

  // Link operations
  addLink: (sourceId: string, targetId: string) => void;
  removeLink: (sourceId: string, targetId: string) => void;
  getOutgoingLinks: (pageId: string) => string[];
  getBacklinks: (pageId: string) => string[];

  // Ghost link operations
  addGhostLink: (linkText: string, sourcePageId: string) => void;
  removeGhostLink: (linkText: string, sourcePageId: string) => void;
  getGhostLinkSources: (linkText: string) => string[];
  promoteGhostLink: (linkText: string) => Page | null;

  // Search
  searchPages: (query: string) => Page[];
}

/**
 * localStorage に永続化されるゲスト用ページストア。サインイン前後の一時編集や
 * オンボーディング時のデータ保持に使う（個人ページのみ、Issue #713）。
 *
 * Guest-mode page store persisted in localStorage. Holds personal pages only
 * (issue #713) for pre-sign-in drafts and onboarding flows.
 */
export const usePageStore = create<PageStore>()(
  persist(
    (set, get) => ({
      pages: [],
      links: [],
      ghostLinks: [],

      createPage: (title = "", content = "") => {
        const now = Date.now();
        const newPage: Page = {
          id: uuidv4(),
          ownerUserId: "local-user",
          // ローカル zustand ストアは個人ページ専用。Issue #713。
          // The local zustand store only holds personal pages. Issue #713.
          noteId: null,
          title,
          content,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };

        set((state) => ({
          pages: [newPage, ...state.pages],
        }));

        return newPage;
      },

      updatePage: (id, updates) => {
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === id ? { ...page, ...updates, updatedAt: Date.now() } : page,
          ),
        }));
      },

      deletePage: (id) => {
        set((state) => ({
          pages: state.pages.map((page) => (page.id === id ? { ...page, isDeleted: true } : page)),
          links: state.links.filter((link) => link.sourceId !== id && link.targetId !== id),
        }));
      },

      getPage: (id) => {
        return get().pages.find((page) => page.id === id && !page.isDeleted);
      },

      getPageByTitle: (title) => {
        const normalizedTitle = title.toLowerCase().trim();
        return get().pages.find(
          (page) => page.title.toLowerCase().trim() === normalizedTitle && !page.isDeleted,
        );
      },

      addLink: (sourceId, targetId) => {
        const exists = get().links.some(
          (link) => link.sourceId === sourceId && link.targetId === targetId,
        );
        if (!exists) {
          set((state) => ({
            links: [...state.links, { sourceId, targetId, createdAt: Date.now() }],
          }));
        }
      },

      removeLink: (sourceId, targetId) => {
        set((state) => ({
          links: state.links.filter(
            (link) => !(link.sourceId === sourceId && link.targetId === targetId),
          ),
        }));
      },

      getOutgoingLinks: (pageId) => {
        return get()
          .links.filter((link) => link.sourceId === pageId)
          .map((link) => link.targetId);
      },

      getBacklinks: (pageId) => {
        return get()
          .links.filter((link) => link.targetId === pageId)
          .map((link) => link.sourceId);
      },

      addGhostLink: (linkText, sourcePageId) => {
        const exists = get().ghostLinks.some(
          (gl) => gl.linkText === linkText && gl.sourcePageId === sourcePageId,
        );
        if (!exists) {
          set((state) => ({
            ghostLinks: [...state.ghostLinks, { linkText, sourcePageId, createdAt: Date.now() }],
          }));
        }
      },

      removeGhostLink: (linkText, sourcePageId) => {
        set((state) => ({
          ghostLinks: state.ghostLinks.filter(
            (gl) => !(gl.linkText === linkText && gl.sourcePageId === sourcePageId),
          ),
        }));
      },

      getGhostLinkSources: (linkText) => {
        return get()
          .ghostLinks.filter((gl) => gl.linkText === linkText)
          .map((gl) => gl.sourcePageId);
      },

      promoteGhostLink: (linkText) => {
        const sources = get().getGhostLinkSources(linkText);
        if (sources.length >= 2) {
          // Create a new page from the ghost link
          const newPage = get().createPage(linkText);

          // Convert ghost links to real links
          sources.forEach((sourceId) => {
            get().addLink(sourceId, newPage.id);
          });

          // Remove ghost links
          set((state) => ({
            ghostLinks: state.ghostLinks.filter((gl) => gl.linkText !== linkText),
          }));

          return newPage;
        }
        return null;
      },

      searchPages: (query) => {
        const normalizedQuery = query.toLowerCase().trim();
        if (!normalizedQuery) return [];

        return get().pages.filter((page) => {
          if (page.isDeleted) return false;

          const titleMatch = page.title.toLowerCase().includes(normalizedQuery);
          const contentMatch = page.content.toLowerCase().includes(normalizedQuery);

          return titleMatch || contentMatch;
        });
      },
    }),
    {
      name: "zedi-pages",
      // v2: `Page.noteId` (Issue #713 / Phase 2) を必須化したため、v1 で
      // localStorage に保存された `noteId` 未設定のページを `null` に寄せる。
      // これをしないと deserialize 後 `page.noteId === undefined` となり、
      // `noteId === null` を期待するコード（個人ページ判定）で取りこぼす。
      //
      // v2: persisted pages from v1 (pre-#713) lack `noteId`. Backfill them to
      // `null` on load so the `Page` type contract (`noteId: string | null`)
      // holds. Otherwise `page.noteId === undefined` would slip past any
      // `noteId === null` check intended to identify personal pages.
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        if (
          version < 2 &&
          persistedState &&
          typeof persistedState === "object" &&
          "pages" in persistedState &&
          Array.isArray((persistedState as { pages: unknown }).pages)
        ) {
          const state = persistedState as { pages: Array<Record<string, unknown>> };
          state.pages = state.pages.map((p) => ({ ...p, noteId: p.noteId ?? null }));
        }
        return persistedState;
      },
    },
  ),
);
