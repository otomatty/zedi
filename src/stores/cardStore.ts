// Card state management store
import { createSignal, createRoot } from "solid-js";
import type { Card, CreateCardInput, UpdateCardInput } from "../types/card";
import * as db from "../lib/database";

// Demo data for browser mode
const DEMO_CARDS: Card[] = [
  {
    id: "demo-1",
    title: "👋 Zediへようこそ",
    content: "<p>Zediは「書くストレス」と「整理する義務」からあなたを解放します。思いついたことを、ただ書く。それだけで知識のネットワークが生まれます。</p>",
    created_at: Math.floor(Date.now() / 1000) - 120,
    updated_at: Math.floor(Date.now() / 1000) - 120,
    is_deleted: false,
  },
  {
    id: "demo-2",
    title: "🔗 リンクの繋ぎ方",
    content: "<p>テキスト中に [[キーワード]] と入力するだけで、カード同士が繋がります。まだ存在しないカードへのリンク（Ghost Link）も作成できます。</p>",
    created_at: Math.floor(Date.now() / 1000) - 300,
    updated_at: Math.floor(Date.now() / 1000) - 300,
    is_deleted: false,
  },
  {
    id: "demo-3",
    title: "🤖 AIの使い方",
    content: "<p>/wiki コマンドを使うと、AIが選択したキーワードについて解説と関連トピックへのリンクを含むカードを自動生成します。</p>",
    created_at: Math.floor(Date.now() / 1000) - 600,
    updated_at: Math.floor(Date.now() / 1000) - 600,
    is_deleted: false,
  },
];

function createCardStore() {
  const [cards, setCards] = createSignal<Card[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [initialized, setInitialized] = createSignal(false);
  const [isUsingDatabase, setIsUsingDatabase] = createSignal(false);

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
        const dbCards = await db.getCards();
        setCards(dbCards);
        console.log("Loaded cards from database:", dbCards.length);
      } else {
        // Use demo data in browser
        console.log("Not in Tauri environment, using demo data");
        setCards(DEMO_CARDS);
      }
      setInitialized(true);
    } catch (err) {
      console.error("Failed to initialize card store:", err);
      setError(err instanceof Error ? err.message : "初期化に失敗しました");
      // Fall back to demo data on error
      setCards(DEMO_CARDS);
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
    
    // Actions
    initialize,
    refresh,
    createCard,
    getCardById,
    updateCard,
    deleteCard,
  };
}

// Create a singleton store
export const cardStore = createRoot(createCardStore);
