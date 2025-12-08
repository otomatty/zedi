// Page state management store
import { createSignal, createRoot } from "solid-js";
import type { Page, CreatePageInput, UpdatePageInput } from "../types/page";
import * as db from "../lib/database";
import * as sync from "../lib/syncService";
import { SEED_PAGES } from "../data/seedPages";

function createPageStore() {
  const [pages, setPages] = createSignal<Page[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [initialized, setInitialized] = createSignal(false);
  const [isUsingDatabase, setIsUsingDatabase] = createSignal(false);
  const [syncStatus, setSyncStatus] = createSignal<{ syncing: boolean; lastSyncAt: number }>({ syncing: false, lastSyncAt: 0 });

  /**
   * Trigger background sync (non-blocking)
   */
  const triggerSync = () => {
    if (!sync.isSyncAvailable()) return;
    
    setSyncStatus(prev => ({ ...prev, syncing: true }));
    sync.syncAll()
      .then(async ({ pulled }) => {
        if (pulled > 0) {
          // Refresh local state if we pulled changes
          const dbPages = await db.getPages();
          setPages(dbPages);
        }
        setSyncStatus({ syncing: false, lastSyncAt: Date.now() / 1000 });
      })
      .catch(err => {
        console.error("Background sync failed:", err);
        setSyncStatus(prev => ({ ...prev, syncing: false }));
      });
  };

  /**
   * Initialize the store and load pages
   */
  const initialize = async () => {
    if (initialized()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Try to initialize database if in Tauri environment
      if (db.isTauriEnvironment()) {
        await db.initDatabase();
        setIsUsingDatabase(true);
        let dbPages = await db.getPages();
        
        // Seeding: If database is empty, inject seed content
        if (dbPages.length === 0) {
          console.log("Empty database detected, seeding initial content...");
          
          // Insert seeds sequentially to respect order and avoid potential async issues in SQLite
          for (const seed of SEED_PAGES) {
            // Use db directly to avoid triggering unnecessary individual syncs
            await db.createPage(seed);
          }
          
          // Reload pages after seeding
          dbPages = await db.getPages();
          console.log(`Seeded ${dbPages.length} pages`);
        }
        
        setPages(dbPages);
        console.log("Loaded pages from database:", dbPages.length);
        
        // Initialize sync and trigger initial sync
        // This will push the newly seeded pages to the server if online
        await sync.initSync();
        triggerSync();
      } else {
        // Use seed data as demo data in browser
        console.log("Not in Tauri environment, using seed data as demo");
        // Convert seed inputs to full page objects for display
        const demoPages = SEED_PAGES.map((seed, index) => ({
          id: `demo-${index}`,
          title: seed.title || "無題",
          content: seed.content || "",
          created_at: Math.floor(Date.now() / 1000) - (index * 60),
          updated_at: Math.floor(Date.now() / 1000) - (index * 60),
          is_deleted: false
        }));
        setPages(demoPages);
      }
      setInitialized(true);
    } catch (err) {
      console.error("Failed to initialize page store:", err);
      setError(err instanceof Error ? err.message : "初期化に失敗しました");
      // Fall back to empty or safe state
      setPages([]);
      setInitialized(true);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Refresh pages from database
   */
  const refresh = async () => {
    if (!isUsingDatabase()) return;
    
    setLoading(true);
    try {
      const dbPages = await db.getPages();
      setPages(dbPages);
    } catch (err) {
      console.error("Failed to refresh pages:", err);
      setError(err instanceof Error ? err.message : "ページの更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Create a new page
   */
  const createPage = async (input: CreatePageInput): Promise<Page> => {
    setError(null);
    
    try {
      if (isUsingDatabase()) {
        const newPage = await db.createPage(input);
        setPages(prev => [newPage, ...prev]);
        triggerSync(); // Sync after create
        return newPage;
      } else {
        // Demo mode: create local page
        const newPage: Page = {
          id: `demo-${Date.now()}`,
          title: input.title || "無題のページ",
          content: input.content || "",
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
          is_deleted: false,
        };
        setPages(prev => [newPage, ...prev]);
        return newPage;
      }
    } catch (err) {
      console.error("Failed to create page:", err);
      setError(err instanceof Error ? err.message : "ページの作成に失敗しました");
      throw err;
    }
  };

  /**
   * Get a page by ID
   */
  const getPageById = async (id: string): Promise<Page | null> => {
    // First check local state
    const localPage = pages().find(p => p.id === id);
    if (localPage) return localPage;
    
    // If using database, try to fetch from DB
    if (isUsingDatabase()) {
      try {
        return await db.getPageById(id);
      } catch (err) {
        console.error("Failed to get page:", err);
        return null;
      }
    }
    
    return null;
  };

  /**
   * Update an existing page
   */
  const updatePage = async (input: UpdatePageInput): Promise<Page> => {
    setError(null);
    
    try {
      if (isUsingDatabase()) {
        const updatedPage = await db.updatePage(input);
        setPages(prev => prev.map(p => p.id === input.id ? updatedPage : p));
        triggerSync(); // Sync after update
        return updatedPage;
      } else {
        // Demo mode: update local page
        const now = Math.floor(Date.now() / 1000);
        const updatedPage: Page = {
          id: input.id,
          title: input.title,
          content: input.content,
          created_at: pages().find(p => p.id === input.id)?.created_at ?? now,
          updated_at: now,
          is_deleted: false,
        };
        setPages(prev => prev.map(p => p.id === input.id ? updatedPage : p));
        return updatedPage;
      }
    } catch (err) {
      console.error("Failed to update page:", err);
      setError(err instanceof Error ? err.message : "ページの更新に失敗しました");
      throw err;
    }
  };

  /**
   * Soft delete a page
   */
  const deletePage = async (id: string): Promise<void> => {
    setError(null);
    
    try {
      if (isUsingDatabase()) {
        await db.softDeletePage(id);
      }
      setPages(prev => prev.filter(p => p.id !== id));
      triggerSync(); // Sync after delete
    } catch (err) {
      console.error("Failed to delete page:", err);
      setError(err instanceof Error ? err.message : "ページの削除に失敗しました");
      throw err;
    }
  };

  return {
    // State
    pages,
    loading,
    error,
    initialized,
    isUsingDatabase,
    syncStatus,
    
    // Actions
    initialize,
    refresh,
    createPage,
    getPageById,
    updatePage,
    deletePage,
    triggerSync,
    
    // Backwards compatibility aliases
    cards: pages,
    createCard: createPage,
    getCardById: getPageById,
    updateCard: updatePage,
    deleteCard: deletePage,
  };
}

// Create a singleton store
export const pageStore = createRoot(createPageStore);

// Backwards compatibility alias
export const cardStore = pageStore;
