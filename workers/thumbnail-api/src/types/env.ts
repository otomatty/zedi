export interface Env {
  CORS_ORIGIN?: string;
  GYAZO_ACCESS_TOKEN?: string;
  GOOGLE_CUSTOM_SEARCH_API_KEY?: string;
  GOOGLE_CUSTOM_SEARCH_ENGINE_ID?: string;
  GOOGLE_GEMINI_API_KEY?: string;
  // 後方互換性のため残す（将来的に削除予定）
  OPENVERSE_API_URL?: string;
  WIKIMEDIA_API_URL?: string;
  WIKIPEDIA_API_URL?: string;
  WIKIPEDIA_REST_URL?: string;
}
