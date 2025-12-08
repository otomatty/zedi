// Card state management store
import { createSignal, createRoot } from "solid-js";
import type { Card, CreateCardInput, UpdateCardInput } from "../types/card";
import * as db from "../lib/database";
import * as sync from "../lib/syncService";
import { SEED_CARDS } from "../data/seedCards";

function createCardStore() {
  const [cards, setCards] = createSignal<Card[]>([]);
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
          const dbCards = await db.getCards();
          setCards(dbCards);
        }
        setSyncStatus({ syncing: false, lastSyncAt: Date.now() / 1000 });
      })
      .catch(err => {
        console.error("Background sync failed:", err);
        setSyncStatus(prev => ({ ...prev, syncing: false }));
      });
  };

  /**
   * Initialize the store and load cards
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
        let dbCards = await db.getCards();
        
        // Seeding: If database is empty, inject seed content
        if (dbCards.length === 0) {
          console.log("Empty database detected, seeding initial content...");
          
          // Insert seeds sequentially to respect order and avoid potential async issues in SQLite
          for (const seed of SEED_CARDS) {
            // Use db directly to avoid triggering unnecessary individual syncs
            await db.createCard(seed);
          }
          
          // Reload cards after seeding
          dbCards = await db.getCards();
          console.log(`Seeded ${dbCards.length} cards`);
        }
        
        setCards(dbCards);
        console.log("Loaded cards from database:", dbCards.length);
        
        // Initialize sync and trigger initial sync
        // This will push the newly seeded cards to the server if online
        await sync.initSync();
        triggerSync();
      } else {
        // Use seed data as demo data in browser
        console.log("Not in Tauri environment, using seed data as demo");
        // Convert seed inputs to full card objects for display
        const demoCards = SEED_CARDS.map((seed, index) => ({
          id: `demo-${index}`,
          title: seed.title || "無題",
          content: seed.content || "",
          created_at: Math.floor(Date.now() / 1000) - (index * 60),
          updated_at: Math.floor(Date.now() / 1000) - (index * 60),
          is_deleted: false
        }));
        setCards(demoCards);
      }
      setInitialized(true);
    } catch (err) {
      console.error("Failed to initialize card store:", err);
      setError(err instanceof Error ? err.message : "初期化に失敗しました");
      // Fall back to empty or safe state
      setCards([]);
      setInitialized(true);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Refresh cards from database
   */
  const refresh = async () => {
    if (!isUsingDatabase()) return;
    
    setLoading(true);
    try {
      const dbCards = await db.getCards();
      setCards(dbCards);
    } catch (err) {
      console.error("Failed to refresh cards:", err);
      setError(err instanceof Error ? err.message : "カードの更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Create a new card
   */
  const createCard = async (input: CreateCardInput): Promise<Card> => {
    setError(null);
    
    try {
      if (isUsingDatabase()) {
        const newCard = await db.createCard(input);
        setCards(prev => [newCard, ...prev]);
        triggerSync(); // Sync after create
        return newCard;
      } else {
        // Demo mode: create local card
        const newCard: Card = {
          id: `demo-${Date.now()}`,
          title: input.title || "無題のカード",
          content: input.content || "",
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
          is_deleted: false,
        };
        setCards(prev => [newCard, ...prev]);
        return newCard;
      }
    } catch (err) {
      console.error("Failed to create card:", err);
      setError(err instanceof Error ? err.message : "カードの作成に失敗しました");
      throw err;
    }
  };

  /**
   * Get a card by ID
   */
  const getCardById = async (id: string): Promise<Card | null> => {
    // First check local state
    const localCard = cards().find(c => c.id === id);
    if (localCard) return localCard;
    
    // If using database, try to fetch from DB
    if (isUsingDatabase()) {
      try {
        return await db.getCardById(id);
      } catch (err) {
        console.error("Failed to get card:", err);
        return null;
      }
    }
    
    return null;
  };

  /**
   * Update an existing card
   */
  const updateCard = async (input: UpdateCardInput): Promise<Card> => {
    setError(null);
    
    try {
      if (isUsingDatabase()) {
        const updatedCard = await db.updateCard(input);
        setCards(prev => prev.map(c => c.id === input.id ? updatedCard : c));
        triggerSync(); // Sync after update
        return updatedCard;
      } else {
        // Demo mode: update local card
        const now = Math.floor(Date.now() / 1000);
        const updatedCard: Card = {
          id: input.id,
          title: input.title,
          content: input.content,
          created_at: cards().find(c => c.id === input.id)?.created_at ?? now,
          updated_at: now,
          is_deleted: false,
        };
        setCards(prev => prev.map(c => c.id === input.id ? updatedCard : c));
        return updatedCard;
      }
    } catch (err) {
      console.error("Failed to update card:", err);
      setError(err instanceof Error ? err.message : "カードの更新に失敗しました");
      throw err;
    }
  };

  /**
   * Soft delete a card
   */
  const deleteCard = async (id: string): Promise<void> => {
    setError(null);
    
    try {
      if (isUsingDatabase()) {
        await db.softDeleteCard(id);
      }
      setCards(prev => prev.filter(c => c.id !== id));
      triggerSync(); // Sync after delete
    } catch (err) {
      console.error("Failed to delete card:", err);
      setError(err instanceof Error ? err.message : "カードの削除に失敗しました");
      throw err;
    }
  };

  return {
    // State
    cards,
    loading,
    error,
    initialized,
    isUsingDatabase,
    syncStatus,
    
    // Actions
    initialize,
    refresh,
    createCard,
    getCardById,
    updateCard,
    deleteCard,
    triggerSync,
  };
}

// Create a singleton store
export const cardStore = createRoot(createCardStore);
