export interface ImageSearchItem {
  id: string;
  previewUrl: string;
  imageUrl: string;
  alt: string;
  sourceName: string;
  sourceUrl: string;
  authorName?: string;
  authorUrl?: string;
}

export interface ImageSearchResponse {
  items: ImageSearchItem[];
  nextCursor?: string;
}

export interface ThumbnailCommitRequest {
  sourceUrl: string;
  title?: string;
  fallbackUrl?: string;
}

export interface ThumbnailCommitResponse {
  imageUrl: string;
  permalinkUrl?: string;
  provider: "gyazo";
}

export interface ImageGenerateRequest {
  prompt: string;
  aspectRatio?: string;
}

export interface ImageGenerateResponse {
  imageUrl: string; // base64データURI
  mimeType: string;
}
