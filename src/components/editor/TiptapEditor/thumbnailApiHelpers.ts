/** Uses same base URL as REST API (VITE_API_BASE_URL). Strips trailing slash. Falls back to window.location.origin when unset. */
export const getThumbnailApiBaseUrl = (): string => {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (typeof env === "string" && env.trim() !== "") return env.trim().replace(/\/$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
};
