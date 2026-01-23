export interface Page {
  id: string;
  ownerUserId?: string;
  title: string;
  content: string; // Tiptap JSON stringified
  contentPreview?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

/**
 * Lightweight page summary without content
 * Use for list views to minimize data transfer and reduce Turso Rows Read
 */
export interface PageSummary {
  id: string;
  ownerUserId?: string;
  title: string;
  contentPreview?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

export interface Link {
  sourceId: string;
  targetId: string;
  createdAt: number;
}

export interface GhostLink {
  linkText: string;
  sourcePageId: string;
  createdAt: number;
}

export interface PageWithLinks extends Page {
  outgoingLinks: string[]; // Page IDs
  incomingLinks: string[]; // Page IDs (backlinks)
}

export type DateGroup = {
  date: string; // YYYY-MM-DD
  label: string; // "今日", "昨日", "12月15日（日）"
  pages: Page[];
};
