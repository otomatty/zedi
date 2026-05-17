/**
 * ノートごとのユーザー側フィルタバー上書き設定の型。
 * Per-note client-side preferences that override a note's DB defaults.
 *
 * フィルタバーの「表示する／隠す／ノート既定に従う」の 3 状態セレクタの
 * 永続化フォーマット。`showTagFilterBar: undefined` (= キー欠如) はノート
 * 既定値に従う、`true` / `false` は明示的なユーザー上書き。
 *
 * Persistence shape for the 3-state filter-bar selector
 * ("note default / always show / always hide"). `undefined` (omitted key)
 * defers to the note's DB default; `true` / `false` is an explicit override.
 */
export interface NoteFilterPreference {
  /**
   * フィルタバー表示の上書き。`undefined` = ノート既定に従う、`true` / `false`
   * はユーザー強制。
   * Filter bar visibility override; `undefined` defers to the note default.
   */
  showTagFilterBar?: boolean;
}

/**
 * localStorage に保存する全ノート分のフィルタ上書きマップ。
 * Map of `noteId → preference` persisted to localStorage.
 */
export type NoteFilterPreferencesMap = Record<string, NoteFilterPreference>;
