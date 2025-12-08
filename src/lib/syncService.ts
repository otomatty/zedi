// Sync service for CRDT-like synchronization between local SQLite and Supabase
// Uses Last Write Wins (LWW) strategy based on updated_at timestamp

import { supabase, hasValidCredentials } from "./supabase";
import * as db from "./database";
import { authStore } from "../stores/authStore";
import type { Card } from "../types/card";

// Generate a unique device ID (persisted in localStorage)
function getDeviceId(): string {
  const key = "zedi_device_id";
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

// Get current Unix timestamp in seconds
function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// Sync state
let lastSyncAt = 0;
let isSyncing = false;

/**
 * Initialize sync service
 */
export async function initSync(): Promise<void> {
  if (!hasValidCredentials || !supabase) {
    console.log("Sync disabled: Supabase not configured");
    return;
  }

  // Load last sync timestamp from Supabase
  const user = authStore.user();
  if (!user) {
    console.log("Sync disabled: User not authenticated");
    return;
  }

  try {
    const { data } = await supabase
      .from("sync_metadata")
      .select("last_sync_at")
      .eq("device_id", getDeviceId())
      .single();

    if (data) {
      lastSyncAt = data.last_sync_at;
    }
    console.log("Sync initialized, last sync:", new Date(lastSyncAt * 1000));
  } catch (error) {
    console.log("No previous sync metadata found, starting fresh");
  }
}

/**
 * Sync all cards between local and remote
 */
export async function syncAll(): Promise<{ pushed: number; pulled: number }> {
  if (!hasValidCredentials || !supabase) {
    throw new Error("Supabase not configured");
  }

  const user = authStore.user();
  if (!user) {
    throw new Error("User not authenticated");
  }

  if (isSyncing) {
    console.log("Sync already in progress, skipping");
    return { pushed: 0, pulled: 0 };
  }

  isSyncing = true;
  console.log("Starting sync...");

  try {
    // Step 1: Push local changes to remote
    const pushed = await pushChanges(user.id);

    // Step 2: Pull remote changes to local
    const pulled = await pullChanges(user.id);

    // Step 3: Update sync metadata
    await updateSyncMetadata(user.id);

    console.log(`Sync complete: pushed ${pushed}, pulled ${pulled}`);
    return { pushed, pulled };
  } finally {
    isSyncing = false;
  }
}

/**
 * Push local changes to Supabase
 */
async function pushChanges(userId: string): Promise<number> {
  if (!supabase) return 0;

  // Get all local cards that were updated after last sync
  const localCards = await db.getCards(1000, 0);
  const cardsToSync = localCards.filter(
    (card) => card.updated_at > lastSyncAt
  );

  if (cardsToSync.length === 0) {
    return 0;
  }

  // Upsert cards to Supabase (LWW - remote will keep newer version)
  const cardsWithUserId = cardsToSync.map((card) => ({
    ...card,
    user_id: userId,
  }));

  const { error } = await supabase.from("cards").upsert(cardsWithUserId, {
    onConflict: "id",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("Failed to push cards:", error);
    throw error;
  }

  return cardsToSync.length;
}

/**
 * Pull remote changes from Supabase
 */
async function pullChanges(userId: string): Promise<number> {
  if (!supabase) return 0;

  // Get remote cards updated after last sync
  const { data: remoteCards, error } = await supabase
    .from("cards")
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", lastSyncAt);

  if (error) {
    console.error("Failed to pull cards:", error);
    throw error;
  }

  if (!remoteCards || remoteCards.length === 0) {
    return 0;
  }

  // Apply remote changes to local database (LWW resolution)
  let applied = 0;
  for (const remoteCard of remoteCards) {
    const localCard = await db.getCardById(remoteCard.id);

    // LWW: Apply remote if it's newer or doesn't exist locally
    if (!localCard || remoteCard.updated_at > localCard.updated_at) {
      await applyRemoteCard(remoteCard);
      applied++;
    }
  }

  return applied;
}

/**
 * Apply a remote card to local database
 */
async function applyRemoteCard(
  remoteCard: Card & { user_id: string }
): Promise<void> {
  const database = db.getDatabase();

  // Check if card exists locally
  const existing = await db.getCardById(remoteCard.id);

  if (existing) {
    // Update existing card
    await database.execute(
      `UPDATE cards 
       SET title = $1, content = $2, updated_at = $3, is_deleted = $4 
       WHERE id = $5`,
      [
        remoteCard.title,
        remoteCard.content,
        remoteCard.updated_at,
        remoteCard.is_deleted ? 1 : 0,
        remoteCard.id,
      ]
    );
  } else {
    // Insert new card
    await database.execute(
      `INSERT INTO cards (id, title, content, created_at, updated_at, is_deleted) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        remoteCard.id,
        remoteCard.title,
        remoteCard.content,
        remoteCard.created_at,
        remoteCard.updated_at,
        remoteCard.is_deleted ? 1 : 0,
      ]
    );
  }
}

/**
 * Update sync metadata after successful sync
 */
async function updateSyncMetadata(userId: string): Promise<void> {
  if (!supabase) return;

  const now = getCurrentTimestamp();

  const { error } = await supabase.from("sync_metadata").upsert(
    {
      user_id: userId,
      device_id: getDeviceId(),
      last_sync_at: now,
    },
    {
      onConflict: "user_id,device_id",
    }
  );

  if (error) {
    console.error("Failed to update sync metadata:", error);
  } else {
    lastSyncAt = now;
  }
}

/**
 * Check if sync is available
 */
export function isSyncAvailable(): boolean {
  return hasValidCredentials && !!supabase && authStore.isAuthenticated();
}

/**
 * Get sync status
 */
export function getSyncStatus(): {
  available: boolean;
  syncing: boolean;
  lastSyncAt: number;
} {
  return {
    available: isSyncAvailable(),
    syncing: isSyncing,
    lastSyncAt,
  };
}
