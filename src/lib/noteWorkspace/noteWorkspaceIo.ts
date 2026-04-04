/**
 * Tauri invoke wrappers for note-linked workspace file access (Issue #461).
 * ノート紐付けワークスペースのファイルアクセス用 Tauri invoke（Issue #461）。
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauriDesktop } from "@/lib/platform";

/**
 * Registers the workspace root for a note in the Rust-side registry (required before read/list).
 * Rust 側レジストリにワークスペースルートを登録する（read/list の前提）。
 * @throws Tauri invoke が失敗した場合（呼び出し側で catch してログ可）。
 * @throws When Tauri invoke fails (callers may catch and log).
 */
export async function registerNoteWorkspaceRoot(
  noteId: string,
  workspaceRoot: string,
): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke("register_note_workspace_root", { noteId, workspaceRoot });
}

/**
 * Clears the registered workspace root for a note.
 * ノートの登録済みワークスペースルートを消す。
 * @throws Tauri invoke が失敗した場合（呼び出し側で catch してログ可）。
 * @throws When Tauri invoke fails (callers may catch and log).
 */
export async function clearNoteWorkspaceRoot(noteId: string): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke("clear_note_workspace_root", { noteId });
}

/**
 * Reads a UTF-8 file under the registered workspace for the note (Rust-resolved root).
 * 登録済みノートのワークスペース配下の UTF-8 を読む（ルートは Rust で解決）。
 */
export async function readNoteWorkspaceFile(
  noteId: string,
  relativePath: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  if (!isTauriDesktop()) {
    return { ok: false, error: "Desktop only." };
  }
  try {
    const content = await invoke<string>("read_note_workspace_file", {
      noteId,
      relativePath: relativePath.replace(/\\/g, "/"),
    });
    return { ok: true, content };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}

/**
 * Lists directory entries under the registered workspace for the note.
 * 登録済みノートのワークスペース配下のエントリを列挙する。
 * @throws Tauri invoke が失敗した場合（呼び出し側で catch してログまたは空表示可）。
 * @throws When Tauri invoke fails (callers may catch and log or show empty UI).
 */
export async function listNoteWorkspaceEntries(
  noteId: string,
  relativeDir: string,
  maxEntries?: number,
  /** Filter names before the cap (case-insensitive prefix); Issue #461 path completion. */
  namePrefix?: string,
): Promise<string[]> {
  if (!isTauriDesktop()) return [];
  const trimmed = namePrefix?.trim();
  return await invoke<string[]>("list_note_workspace_entries", {
    noteId,
    relativeDir: relativeDir.replace(/\\/g, "/"),
    maxEntries: maxEntries ?? null,
    namePrefix: trimmed && trimmed.length > 0 ? trimmed : null,
  });
}
