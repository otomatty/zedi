/**
 * Web Clipper 用 URL 検証。
 * URL validation for Web Clipper.
 */

/**
 * URL が http/https として有効かどうかを検証する。
 * Validates that the URL is a valid http or https URL.
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
