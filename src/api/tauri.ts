// Tauri API wrapper for card operations
import { invoke } from "@tauri-apps/api/core";
import type { Card, CreateCardInput, UpdateCardInput } from "../types/card";

/**
 * Create a new card
 */
export async function createCard(input: CreateCardInput): Promise<Card> {
  return await invoke<Card>("create_card", { input });
}

/**
 * Get all cards (non-deleted) ordered by created_at desc
 */
export async function getCards(limit?: number, offset?: number): Promise<Card[]> {
  return await invoke<Card[]>("get_cards", { limit, offset });
}

/**
 * Get a single card by ID
 */
export async function getCardById(id: string): Promise<Card | null> {
  return await invoke<Card | null>("get_card_by_id", { id });
}

/**
 * Update an existing card
 */
export async function updateCard(input: UpdateCardInput): Promise<Card> {
  return await invoke<Card>("update_card", { input });
}

/**
 * Soft delete a card
 */
export async function softDeleteCard(id: string): Promise<void> {
  return await invoke<void>("soft_delete_card", { id });
}
