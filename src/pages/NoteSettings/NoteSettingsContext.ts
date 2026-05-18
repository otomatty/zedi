import { createContext, useContext } from "react";
import type { Note, NoteAccess, NoteAccessRole } from "@/types/note";

/**
 * 設定画面サブルート間で共有する Note / アクセス権コンテキスト。
 * Shared context for all `/notes/:noteId/settings/*` subroutes — provides the
 * already-fetched `note`, the caller's `access`, and per-section gating flags
 * so individual sections do not have to re-fetch or re-derive permissions.
 *
 * `canManage` は owner かつ source=local のとき true。
 * `canViewAsEditor` は editor が read-only で閲覧可能なときの判定に使う。
 */
export interface NoteSettingsContextValue {
  /** 解決済みのノート本体。レイアウトは null/未取得のまま子を描画しない。 */
  note: Note;
  /** 呼び出しユーザーのアクセス権・ロール情報。 */
  access: NoteAccess;
  /** 現在ユーザーのノート上のロール（`access.role` を利便上で再公開）。 */
  role: NoteAccessRole;
  /**
   * owner 相当（管理操作可能）か。Local source 上の owner にのみ true。
   * Editor / viewer は false。
   */
  canManage: boolean;
  /**
   * Editor が read-only で閲覧できるセクション（メンバー / リンク / ドメイン）に
   * アクセス可能か。`role === "editor"` かつ source=local のとき true。
   */
  canViewAsEditor: boolean;
}

/**
 * `/notes/:noteId/settings/*` レイアウトが解決済みの値を子セクションに配る
 * React コンテキスト。レイアウト外で `useNoteSettingsContext` を呼ぶと
 * `null` のため throw する。
 *
 * React context populated by the settings layout. Subroutes consume it via
 * {@link useNoteSettingsContext}; using that hook outside the layout throws.
 */
export const NoteSettingsContext = createContext<NoteSettingsContextValue | null>(null);

/**
 * 設定画面サブルート用の必須コンテキストフック。レイアウトの外で呼ぶと throw する。
 * Required hook for `/notes/:noteId/settings/*` subroutes. Throws when used
 * outside the settings layout so misuse fails loudly in dev/test.
 */
export function useNoteSettingsContext(): NoteSettingsContextValue {
  const ctx = useContext(NoteSettingsContext);
  if (!ctx) {
    throw new Error(
      "useNoteSettingsContext must be used inside <NoteSettingsLayout> (route /notes/:noteId/settings/*).",
    );
  }
  return ctx;
}
