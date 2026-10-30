/** Keyset position in the `(updated_at DESC, id DESC)` page list. */
export interface PageCursor {
  updatedAt: number;
  id: string;
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

/**
 * Encodes a keyset position as an opaque URL-safe token.
 * キーセット位置を URL セーフな不透明トークンにする。
 */
export function encodeCursor(cursor: PageCursor): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(cursor)));
}

/**
 * Decodes a token from `encodeCursor`; returns null for anything malformed.
 * `encodeCursor` のトークンを復元する。不正な値は null。
 */
export function decodeCursor(raw: string): PageCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const binary = atob(raw.replaceAll("-", "+").replaceAll("_", "/"));
    const value: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    );
    if (typeof value !== "object" || value === null) return null;
    const { updatedAt, id } = value as Record<string, unknown>;
    if (
      typeof updatedAt !== "number" ||
      !Number.isFinite(updatedAt) ||
      typeof id !== "string" ||
      id === ""
    ) {
      return null;
    }
    return { updatedAt, id };
  } catch {
    return null;
  }
}
