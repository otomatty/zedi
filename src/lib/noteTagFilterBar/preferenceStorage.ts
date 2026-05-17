import type { NoteFilterPreference, NoteFilterPreferencesMap } from "@/types/noteFilterPreferences";

/**
 * ノートごとのフィルタバー表示上書きを localStorage に保存・読み出すヘルパー。
 * Helpers for persisting per-note filter-bar visibility overrides to localStorage.
 *
 * 保存形は `{ [noteId]: { showTagFilterBar?: boolean } }` の JSON。`undefined`
 * フィールドは削除キーとして扱い、空オブジェクトになったエントリ自体を取り除く。
 * 選択中タグ自体は **URL に永続化** するため、ここでは扱わない (真実のソースを
 * 一本化するため)。
 *
 * Stored as `{ [noteId]: { showTagFilterBar?: boolean } }` JSON. `undefined`
 * removes the field; an entry whose object becomes empty is removed entirely.
 * The selected tags themselves live in the URL — never duplicated here.
 */

/**
 * localStorage キー。`zedi-` プレフィックスは既存のキー (`zedi-general-settings`
 * 等) と整合させる。 / localStorage key, matching the `zedi-` prefix used by
 * the rest of the app.
 */
export const NOTE_FILTER_PREFERENCES_STORAGE_KEY = "zedi-note-filter-preferences";

/**
 * 全ノート分のフィルタ上書きを読み込む。パース失敗・未保存は空マップ。
 * Load every per-note override; corrupt or absent storage yields an empty map.
 */
export function loadNoteFilterPreferences(): NoteFilterPreferencesMap {
  try {
    const stored = readStorage(NOTE_FILTER_PREFERENCES_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const out: NoteFilterPreferencesMap = {};
    for (const [noteId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!noteId) continue;
      if (!value || typeof value !== "object") continue;
      const candidate = value as { showTagFilterBar?: unknown };
      const sanitized: NoteFilterPreference = {};
      if (typeof candidate.showTagFilterBar === "boolean") {
        sanitized.showTagFilterBar = candidate.showTagFilterBar;
      }
      if (Object.keys(sanitized).length > 0) out[noteId] = sanitized;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 全ノート分のフィルタ上書きを保存する。空オブジェクトを持つエントリは削除する。
 * Persist every per-note override; entries whose object is empty are dropped.
 */
export function saveNoteFilterPreferences(prefs: NoteFilterPreferencesMap): void {
  try {
    const compacted: NoteFilterPreferencesMap = {};
    for (const [noteId, value] of Object.entries(prefs)) {
      if (!value) continue;
      const sanitized: NoteFilterPreference = {};
      if (typeof value.showTagFilterBar === "boolean") {
        sanitized.showTagFilterBar = value.showTagFilterBar;
      }
      if (Object.keys(sanitized).length > 0) compacted[noteId] = sanitized;
    }
    writeStorage(NOTE_FILTER_PREFERENCES_STORAGE_KEY, JSON.stringify(compacted));
  } catch (error) {
    console.error("Failed to save note filter preferences:", error);
  }
}

/**
 * 指定ノートの「フィルタバーを表示する」上書きを設定または解除する。
 * `value === undefined` のときは上書きを削除して「ノート既定に従う」に戻す。
 *
 * Set or clear the per-note "show filter bar" override. Passing `undefined`
 * deletes the override, reverting to the note's DB default.
 *
 * @returns 更新後の全ノート分プレファレンスマップ (呼び出し元での参照用)。
 *   The updated preferences map after the change.
 */
export function setShowTagFilterBarOverride(
  noteId: string,
  value: boolean | undefined,
): NoteFilterPreferencesMap {
  if (!noteId) return loadNoteFilterPreferences();
  const current = loadNoteFilterPreferences();
  const next: NoteFilterPreferencesMap = { ...current };
  if (value === undefined) {
    const existing = next[noteId];
    if (existing) {
      const { showTagFilterBar: _omit, ...rest } = existing;
      void _omit;
      if (Object.keys(rest).length === 0) {
        const { [noteId]: _removed, ...remaining } = next;
        void _removed;
        saveNoteFilterPreferences(remaining);
        return remaining;
      }
      next[noteId] = rest;
    }
  } else {
    next[noteId] = { ...next[noteId], showTagFilterBar: value };
  }
  saveNoteFilterPreferences(next);
  return next;
}

/**
 * 指定ノートの上書き値を 1 件取り出す (キー欠如時は `undefined`)。
 * Read a single note's override, or `undefined` when missing.
 */
export function getShowTagFilterBarOverride(noteId: string): boolean | undefined {
  if (!noteId) return undefined;
  const map = loadNoteFilterPreferences();
  return map[noteId]?.showTagFilterBar;
}

function readStorage(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

function writeStorage(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, value);
}
