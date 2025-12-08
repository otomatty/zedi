// Database service layer using @tauri-apps/plugin-sql
import Database from "@tauri-apps/plugin-sql";
import type { Page, CreatePageInput, UpdatePageInput } from "../types/page";

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
 * Create a new page
 */
export async function createPage(input: CreatePageInput): Promise<Page> {
  const database = getDatabase();
  const id = generateUUID();
  const now = getCurrentTimestamp();
  
  await database.execute(
    `INSERT INTO pages (id, title, content, created_at, updated_at, is_deleted) 
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
 * Get all pages (non-deleted) ordered by created_at desc
 */
export async function getPages(limit = 100, offset = 0): Promise<Page[]> {
  const database = getDatabase();
  
  const result = await database.select<Page[]>(
    `SELECT id, title, content, created_at, updated_at, is_deleted 
     FROM pages 
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
 * Get a single page by ID
 */
export async function getPageById(id: string): Promise<Page | null> {
  const database = getDatabase();
  
  const result = await database.select<Page[]>(
    `SELECT id, title, content, created_at, updated_at, is_deleted 
     FROM pages 
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
 * Update an existing page
 */
export async function updatePage(input: UpdatePageInput): Promise<Page> {
  const database = getDatabase();
  const now = getCurrentTimestamp();
  
  await database.execute(
    `UPDATE pages 
     SET title = $1, content = $2, updated_at = $3 
     WHERE id = $4`,
    [input.title, input.content, now, input.id]
  );
  
  const updated = await getPageById(input.id);
  if (!updated) {
    throw new Error(`Page not found: ${input.id}`);
  }
  
  return updated;
}

/**
 * Soft delete a page
 */
export async function softDeletePage(id: string): Promise<void> {
  const database = getDatabase();
  const now = getCurrentTimestamp();
  
  await database.execute(
    `UPDATE pages 
     SET is_deleted = 1, updated_at = $1 
     WHERE id = $2`,
    [now, id]
  );
}

/**
 * Get page count
 */
export async function getPageCount(): Promise<number> {
  const database = getDatabase();
  
  const result = await database.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM pages WHERE is_deleted = 0`
  );
  
  return result[0]?.count ?? 0;
}

// Backwards compatibility aliases
export const createCard = createPage;
export const getCards = getPages;
export const getCardById = getPageById;
export const updateCard = updatePage;
export const softDeleteCard = softDeletePage;
export const getCardCount = getPageCount;
