/**
 * Shared CORS_ORIGIN parsing. Use this instead of duplicating logic in app.ts and routes.
 * Each configured value is normalized to its origin (scheme + host + port) so that
 * trailing slashes or paths in CORS_ORIGIN do not cause false 403s.
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim() || "";
  if (!raw || raw === "*") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      try {
        return [new URL(s).origin];
      } catch {
        console.warn(`[cors] Invalid origin in CORS_ORIGIN, skipping: ${s}`);
        return [];
      }
    });
}

export function isWildcardCors(): boolean {
  const raw = process.env.CORS_ORIGIN?.trim() || "";
  return !raw || raw === "*";
}
