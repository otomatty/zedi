/**
 * Tauri invoke wrappers for note-linked workspace file access (Issue #461).
 * ノート紐付けワークスペースのファイルアクセス用 Tauri invoke（Issue #461）。
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauriDesktop } from "@/lib/platform";

/**
 * Reads a UTF-8 file under workspace root (server-validated path).
 * ワークスペースルート配下の UTF-8 ファイルを読む（サーバ側でパス検証）。
 */
export async function readNoteWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  if (!isTauriDesktop()) {
    return { ok: false, error: "Desktop only." };
  }
  try {
    const content = await invoke<string>("read_note_workspace_file", {
      workspaceRoot,
      relativePath: relativePath.replace(/\\/g, "/"),
    });
    return { ok: true, content };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}

/**
 * Lists directory entries (same shape as process-cwd listing).
 * ディレクトリエントリを列挙する（プロセス cwd 列挙と同じ形）。
 */
export async function listNoteWorkspaceEntries(
  workspaceRoot: string,
  relativeDir: string,
  maxEntries?: number,
): Promise<string[]> {
  if (!isTauriDesktop()) return [];
  try {
    return await invoke<string[]>("list_note_workspace_entries", {
      workspaceRoot,
      relativeDir: relativeDir.replace(/\\/g, "/"),
      maxEntries: maxEntries ?? null,
    });
  } catch {
    return [];
  }
}
