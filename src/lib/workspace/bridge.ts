/**
 * Tauri workspace helpers (directory listing for slash path completion).
 * スラッシュのパス補完用ディレクトリ一覧（Tauri）。
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauriDesktop } from "@/lib/platform";

/**
 * Lists names in a directory relative to the app process cwd (repo root in dev).
 * Directories are returned with a trailing `/`.
 *
 * プロセス cwd 基準の相対ディレクトリ内の名前を返す。ディレクトリは末尾 `/`。
 */
export async function listWorkspaceDirectoryEntries(relativeDir: string): Promise<string[]> {
  if (!isTauriDesktop()) return [];
  try {
    return await invoke<string[]>("list_workspace_directory_entries", {
      relativeDir: relativeDir.replace(/\\/g, "/"),
    });
  } catch {
    return [];
  }
}
