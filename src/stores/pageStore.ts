import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { Page, Link, GhostLink, LinkType } from "@/types/page";

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

  // Link operations. `linkType` は issue #725 Phase 1 で追加。未指定は `'wiki'`。
  // `linkType` added in issue #725 Phase 1; defaults to `'wiki'`.
  addLink: (sourceId: string, targetId: string, linkType?: LinkType) => void;
  removeLink: (sourceId: string, targetId: string, linkType?: LinkType) => void;
  getOutgoingLinks: (pageId: string, linkType?: LinkType) => string[];
  getBacklinks: (pageId: string, linkType?: LinkType) => string[];

  // Ghost link operations
  addGhostLink: (linkText: string, sourcePageId: string, linkType?: LinkType) => void;
  removeGhostLink: (linkText: string, sourcePageId: string, linkType?: LinkType) => void;
  getGhostLinkSources: (linkText: string, linkType?: LinkType) => string[];
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

      addLink: (sourceId, targetId, linkType = "wiki") => {
        const exists = get().links.some(
          (link) =>
            link.sourceId === sourceId && link.targetId === targetId && link.linkType === linkType,
        );
        if (!exists) {
          set((state) => ({
            links: [...state.links, { sourceId, targetId, linkType, createdAt: Date.now() }],
          }));
        }
      },

      removeLink: (sourceId, targetId, linkType = "wiki") => {
        set((state) => ({
          links: state.links.filter(
            (link) =>
              !(
                link.sourceId === sourceId &&
                link.targetId === targetId &&
                link.linkType === linkType
              ),
          ),
        }));
      },

      getOutgoingLinks: (pageId, linkType) => {
        return get()
          .links.filter(
            (link) =>
              link.sourceId === pageId && (linkType === undefined || link.linkType === linkType),
          )
          .map((link) => link.targetId);
      },

      getBacklinks: (pageId, linkType) => {
        return get()
          .links.filter(
            (link) =>
              link.targetId === pageId && (linkType === undefined || link.linkType === linkType),
          )
          .map((link) => link.sourceId);
      },

      addGhostLink: (linkText, sourcePageId, linkType = "wiki") => {
        const exists = get().ghostLinks.some(
          (gl) =>
            gl.linkText === linkText &&
            gl.sourcePageId === sourcePageId &&
            gl.linkType === linkType,
        );
        if (!exists) {
          set((state) => ({
            ghostLinks: [
              ...state.ghostLinks,
              { linkText, sourcePageId, linkType, createdAt: Date.now() },
            ],
          }));
        }
      },

      removeGhostLink: (linkText, sourcePageId, linkType = "wiki") => {
        set((state) => ({
          ghostLinks: state.ghostLinks.filter(
            (gl) =>
              !(
                gl.linkText === linkText &&
                gl.sourcePageId === sourcePageId &&
                gl.linkType === linkType
              ),
          ),
        }));
      },

      getGhostLinkSources: (linkText, linkType) => {
        return get()
          .ghostLinks.filter(
            (gl) =>
              gl.linkText === linkText && (linkType === undefined || gl.linkType === linkType),
          )
          .map((gl) => gl.sourcePageId);
      },

      promoteGhostLink: (linkText) => {
        // Promotion is wiki-only; tag ghosts are resolved via tag sync, not
        // multi-source promotion (issue #725 Phase 1).
        const sources = get().getGhostLinkSources(linkText, "wiki");
        if (sources.length >= 2) {
          // Create a new page from the ghost link
          const newPage = get().createPage(linkText);

          // Convert ghost links to real links
          sources.forEach((sourceId) => {
            get().addLink(sourceId, newPage.id, "wiki");
          });

          // Remove ghost links
          set((state) => ({
            ghostLinks: state.ghostLinks.filter(
              (gl) => !(gl.linkText === linkText && gl.linkType === "wiki"),
            ),
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
      // v3: `Link.linkType` / `GhostLink.linkType` (Issue #725 Phase 1) を必須化
      // したため、v2 以前で永続化された `linkType` 未設定の行を `'wiki'` に寄せる。
      // これをしないと `addLink` / `removeLink` 等の `linkType === linkType` 比較
      // が失敗し、重複 insert や削除漏れが起きる（IndexedDB 側は `migrateLinkStoreToV3`
      // で対処済、その対応物をゲストストアでも実行する）。
      //
      // v2: persisted pages from v1 (pre-#713) lack `noteId`. Backfill them to
      // `null` on load so the `Page` type contract (`noteId: string | null`) holds.
      // v3: persisted links / ghost links from v1–v2 lack `linkType` (issue
      // #725 Phase 1). Backfill to `'wiki'` so the new `linkType === linkType`
      // comparisons in `addLink` / `removeLink` don't silently drop to the
      // `undefined === 'wiki'` branch. Mirrors the IndexedDB v3 migration.
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }
        const state = persistedState as {
          pages?: Array<Record<string, unknown>>;
          links?: Array<Record<string, unknown>>;
          ghostLinks?: Array<Record<string, unknown>>;
        };

        if (version < 2 && Array.isArray(state.pages)) {
          state.pages = state.pages.map((p) => ({ ...p, noteId: p.noteId ?? null }));
        }

        if (version < 3) {
          if (Array.isArray(state.links)) {
            state.links = state.links.map((l) => ({ ...l, linkType: l.linkType ?? "wiki" }));
          }
          if (Array.isArray(state.ghostLinks)) {
            state.ghostLinks = state.ghostLinks.map((g) => ({
              ...g,
              linkType: g.linkType ?? "wiki",
            }));
          }
        }

        return persistedState;
      },
    },
  ),
);
