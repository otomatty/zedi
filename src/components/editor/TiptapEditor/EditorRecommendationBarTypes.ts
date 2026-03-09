export interface ThumbnailCandidate {
  id: string;
  previewUrl: string;
  imageUrl: string;
  alt: string;
  sourceName: string;
  sourceUrl: string;
  authorName?: string;
  authorUrl?: string;
}

export interface EditorRecommendationBarProps {
  pageTitle: string;
  isReadOnly: boolean;
  hasThumbnail: boolean;
  onSelectThumbnail: (imageUrl: string, alt: string, previewUrl?: string) => void;
}

export type RecommendationMode = "actions" | "thumbnails" | "generating";
