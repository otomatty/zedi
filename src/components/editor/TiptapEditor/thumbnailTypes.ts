/**
 * サムネイル候補の表現。`useThumbnailImageSearch` が `/api/thumbnail/image-search`
 * のレスポンス `items` を反映する型として用い、`PageActionHub` の検索アクションも
 * 同じ型を介してエディタに渡す。
 *
 * Thumbnail candidate descriptor used by `useThumbnailImageSearch` to mirror
 * the `items` payload from `/api/thumbnail/image-search`, and shared with the
 * `PageActionHub` thumbnail-search action when forwarding selections to the
 * editor.
 */
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
