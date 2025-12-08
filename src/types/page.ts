// Type definitions for Zedi data models

export interface Page {
  id: string;
  title: string;
  content: string;
  created_at: number;  // Unix timestamp
  updated_at: number;
  is_deleted: boolean;
}

export interface CreatePageInput {
  title: string;
  content: string;
}

export interface UpdatePageInput {
  id: string;
  title: string;
  content: string;
}

export interface Link {
  source_id: string;
  target_id: string;
  created_at: number;
}

export interface GhostLink {
  link_text: string;
  source_page_id: string;
  created_at: number;
}

// Backwards compatibility aliases (can be removed later)
export type Card = Page;
export type CreateCardInput = CreatePageInput;
export type UpdateCardInput = UpdatePageInput;
