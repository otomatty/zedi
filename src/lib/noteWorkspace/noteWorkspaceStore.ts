/**
 * Local-only persisted mapping noteId → absolute workspace path (Issue #461).
 * ノート ID → ワークスペース絶対パスのローカル専用永続化（Issue #461）。
 *
 * @remarks
 * Not synced to the API server. Paths stay on this device.
 * API サーバには同期しない。パスは端末ローカルのみ。
 */

const STORAGE_KEY = "zedi.noteWorkspace.v1";

type NoteWorkspaceMap = Record<string, string>;

function readMap(): NoteWorkspaceMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as NoteWorkspaceMap;
  } catch {
    return {};
  }
}

function writeMap(map: NoteWorkspaceMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Returns the saved workspace path for a note, or null.
 * ノートに保存されたワークスペースパスを返す。なければ null。
 */
export function readNoteWorkspacePath(noteId: string): string | null {
  const v = readMap()[noteId];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Persists the workspace path for a note.
 * ノートのワークスペースパスを保存する。
 */
export function writeNoteWorkspacePath(noteId: string, absolutePath: string): void {
  const map = readMap();
  map[noteId] = absolutePath.trim();
  writeMap(map);
}

/**
 * Removes the workspace path for a note.
 * ノートのワークスペースパスを削除する。
 */
export function clearNoteWorkspacePath(noteId: string): void {
  const map = readMap();
  if (!(noteId in map)) return;
  const { [noteId]: _removed, ...rest } = map;
  void _removed;
  writeMap(rest);
}
