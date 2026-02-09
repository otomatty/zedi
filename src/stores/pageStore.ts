import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Page, Link, GhostLink } from '@/types/page';

interface PageStore {
  pages: Page[];
  links: Link[];
  ghostLinks: GhostLink[];
  
  // Page CRUD
  createPage: (title?: string, content?: string) => Page;
  updatePage: (id: string, updates: Partial<Pick<Page, 'title' | 'content' | 'thumbnailUrl'>>) => void;
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

export const usePageStore = create<PageStore>()(
  persist(
    (set, get) => ({
      pages: [],
      links: [],
      ghostLinks: [],

      createPage: (title = '', content = '') => {
        const now = Date.now();
        const newPage: Page = {
          id: uuidv4(),
          ownerUserId: 'local-user',
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
            page.id === id
              ? { ...page, ...updates, updatedAt: Date.now() }
              : page
          ),
        }));
      },

      deletePage: (id) => {
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === id ? { ...page, isDeleted: true } : page
          ),
          links: state.links.filter(
            (link) => link.sourceId !== id && link.targetId !== id
          ),
        }));
      },

      getPage: (id) => {
        return get().pages.find((page) => page.id === id && !page.isDeleted);
      },

      getPageByTitle: (title) => {
        const normalizedTitle = title.toLowerCase().trim();
        return get().pages.find(
          (page) => 
            page.title.toLowerCase().trim() === normalizedTitle && 
            !page.isDeleted
        );
      },

      addLink: (sourceId, targetId) => {
        const exists = get().links.some(
          (link) => link.sourceId === sourceId && link.targetId === targetId
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
            (link) => !(link.sourceId === sourceId && link.targetId === targetId)
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
          (gl) => gl.linkText === linkText && gl.sourcePageId === sourcePageId
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
            (gl) => !(gl.linkText === linkText && gl.sourcePageId === sourcePageId)
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
      name: 'zedi-pages',
    }
  )
);
