/** localStorage key for user-pinned note ids. / ピン留めノート ID の保存キー */
export const NOTE_PINNED_STORAGE_KEY = "zedi-note-pinned-ids";

/**
 * Fired in-tab when pin list changes (`storage` is cross-tab only).
 * ピン一覧が変わったときに同一タブへ通知する（`storage` は別タブ専用）。
 */
export const NOTE_PINNED_CHANGED_EVENT = "zedi-note-pinned-changed";

/** Max user-pinned notes (default note is always shown separately). / ユーザーがピンできる上限 */
export const MAX_PINNED_NOTES = 5;

/**
 * Read pinned note ids from localStorage (newest pin last in array order).
 * localStorage からピン留め ID 一覧を読み込む（配列順＝ピンした順）。
 */
export function readPinnedNoteIds(): string[] {
  try {
    const raw = localStorage.getItem(NOTE_PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/**
 * Persist pinned note ids. Silently no-ops on quota errors.
 * ピン留め ID を保存する。quota 超過時は握りつぶす。
 */
export function writePinnedNoteIds(ids: string[]): void {
  try {
    localStorage.setItem(NOTE_PINNED_STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_PINNED_NOTES)));
  } catch {
    // ignore
  }
}

/**
 * Remove the default note id from user pins (shown separately in the pinned section).
 * 既定ノート ID をユーザーピンから除去する（ピンセクションでは別枠表示）。
 */
export function stripDefaultNoteFromPinnedIds(
  pinnedIds: string[],
  defaultNoteId: string | null,
): string[] {
  if (!defaultNoteId) return pinnedIds;
  return pinnedIds.filter((id) => id !== defaultNoteId);
}

/**
 * Toggle a pin for `noteId`. Returns the updated id list (capped).
 * `noteId` のピンを切り替え、更新後の ID 一覧を返す。
 */
export function togglePinnedNoteId(noteId: string, current: string[]): string[] {
  const index = current.indexOf(noteId);
  if (index >= 0) {
    return current.filter((id) => id !== noteId);
  }
  if (current.length >= MAX_PINNED_NOTES) {
    return [...current.slice(1), noteId];
  }
  return [...current, noteId];
}

/**
 * Whether `noteId` is in the user pin list.
 * ユーザーがピン留めしたノートかどうか。
 */
export function isNotePinned(noteId: string, pinnedIds: string[]): boolean {
  return pinnedIds.includes(noteId);
}
