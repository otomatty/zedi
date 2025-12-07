// Database service layer using @tauri-apps/plugin-sql
import Database from "@tauri-apps/plugin-sql";
import type { Card, CreateCardInput, UpdateCardInput } from "../types/card";

// Singleton database instance
let db: Database | null = null;

/**
 * Initialize database connection
 */
export async function initDatabase(): Promise<Database> {
  if (db) return db;
  
  try {
    db = await Database.load("sqlite:zedi.db");
    return db;
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}

/**
 * Get database instance (throws if not initialized)
 */
export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

/**
 * Check if running in Tauri environment
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Get current Unix timestamp in seconds
 */
function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Create a new card
 */
export async function createCard(input: CreateCardInput): Promise<Card> {
  const database = getDatabase();
  const id = generateUUID();
  const now = getCurrentTimestamp();
  
  await database.execute(
    `INSERT INTO cards (id, title, content, created_at, updated_at, is_deleted) 
     VALUES ($1, $2, $3, $4, $5, 0)`,
    [id, input.title || "", input.content || "", now, now]
  );
  
  return {
    id,
    title: input.title || "",
    content: input.content || "",
    created_at: now,
    updated_at: now,
    is_deleted: false,
  };
}

/**
 * Get all cards (non-deleted) ordered by created_at desc
 */
export async function getCards(limit = 100, offset = 0): Promise<Card[]> {
  const database = getDatabase();
  
  const result = await database.select<Card[]>(
    `SELECT id, title, content, created_at, updated_at, is_deleted 
     FROM cards 
     WHERE is_deleted = 0 
     ORDER BY created_at DESC 
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  
  return result.map(row => ({
    ...row,
    is_deleted: Boolean(row.is_deleted),
  }));
}

/**
 * Get a single card by ID
 */
export async function getCardById(id: string): Promise<Card | null> {
  const database = getDatabase();
  
  const result = await database.select<Card[]>(
    `SELECT id, title, content, created_at, updated_at, is_deleted 
     FROM cards 
     WHERE id = $1`,
    [id]
  );
  
  if (result.length === 0) return null;
  
  return {
    ...result[0],
    is_deleted: Boolean(result[0].is_deleted),
  };
}

/**
 * Update an existing card
 */
export async function updateCard(input: UpdateCardInput): Promise<Card> {
  const database = getDatabase();
  const now = getCurrentTimestamp();
  
  await database.execute(
    `UPDATE cards 
     SET title = $1, content = $2, updated_at = $3 
     WHERE id = $4`,
    [input.title, input.content, now, input.id]
  );
  
  const updated = await getCardById(input.id);
  if (!updated) {
    throw new Error(`Card not found: ${input.id}`);
  }
  
  return updated;
}

/**
 * Soft delete a card
 */
export async function softDeleteCard(id: string): Promise<void> {
  const database = getDatabase();
  const now = getCurrentTimestamp();
  
  await database.execute(
    `UPDATE cards 
     SET is_deleted = 1, updated_at = $1 
     WHERE id = $2`,
    [now, id]
  );
}

/**
 * Get card count
 */
export async function getCardCount(): Promise<number> {
  const database = getDatabase();
  
  const result = await database.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM cards WHERE is_deleted = 0`
  );
  
  return result[0]?.count ?? 0;
}
