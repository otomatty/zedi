// Type definitions for Zedi data models

export interface Card {
  id: string;
  title: string;
  content: string;
  created_at: number;  // Unix timestamp
  updated_at: number;
  is_deleted: boolean;
}

export interface CreateCardInput {
  title: string;
  content: string;
}

export interface UpdateCardInput {
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
  source_card_id: string;
  created_at: number;
}
