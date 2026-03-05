/**
 * Shared CORS_ORIGIN parsing. Use this instead of duplicating logic in app.ts and routes.
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim() || "";
  if (!raw || raw === "*") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isWildcardCors(): boolean {
  const raw = process.env.CORS_ORIGIN?.trim() || "";
  return !raw || raw === "*";
}
