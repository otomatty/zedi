/** Uses same base URL as REST API (VITE_API_BASE_URL). Strips trailing slash for path concatenation. */
export const getThumbnailApiBaseUrl = () =>
  ((import.meta.env.VITE_API_BASE_URL as string) ?? "").replace(/\/$/, "");
