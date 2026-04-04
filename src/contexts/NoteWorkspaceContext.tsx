import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearNoteWorkspacePath,
  readNoteWorkspacePath,
  writeNoteWorkspacePath,
} from "@/lib/noteWorkspace/noteWorkspaceStore";
import {
  clearNoteWorkspaceRoot,
  registerNoteWorkspaceRoot,
} from "@/lib/noteWorkspace/noteWorkspaceIo";
import { pickNoteWorkspaceDirectory } from "@/lib/noteWorkspace/pickNoteWorkspaceDirectory";
import { isTauriDesktop } from "@/lib/platform";

/**
 * Value provided by {@link NoteWorkspaceProvider} (local workspace path, Issue #461).
 * {@link NoteWorkspaceProvider} が提供する値（ローカルワークスペース、Issue #461）。
 */
export interface NoteWorkspaceContextValue {
  /** Current note id / 現在のノート ID */
  noteId: string;
  /**
   * Canonical workspace root from local storage, or null.
   * ローカルストレージのワークスペースルート。未設定は null。
   */
  workspaceRoot: string | null;
  /** Persists path and updates state / パスを保存して状態更新 */
  setWorkspaceRoot: (path: string) => void;
  /** Clears persisted path / 保存を消去 */
  clearWorkspace: () => void;
  /** Opens folder picker; on success persists / フォルダ選択して保存 */
  pickWorkspace: () => Promise<void>;
}

const NoteWorkspaceContext = createContext<NoteWorkspaceContextValue | null>(null);

/**
 * Provides per-note linked workspace path (local only, Issue #461).
 * ノート単位のリンク済みワークスペース（ローカルのみ、Issue #461）。
 */
export function NoteWorkspaceProvider({
  noteId,
  children,
}: {
  noteId: string;
  children: ReactNode;
}) {
  const [workspaceRoot, setWorkspaceRootState] = useState<string | null>(() =>
    readNoteWorkspacePath(noteId),
  );

  /**
   * Serialize Rust registry updates so async completions cannot apply out of order (Issue #461).
   * Rust レジストリ更新を直列化し、非同期完了順の逆転で stale が残らないようにする（Issue #461）。
   */
  const rustRegistryQueueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueRustRegistrySync = useCallback((run: () => Promise<void>) => {
    if (!isTauriDesktop()) return;
    rustRegistryQueueRef.current = rustRegistryQueueRef.current.then(run).catch((e) => {
      console.error("[NoteWorkspace] Rust registry sync failed", e);
    });
  }, []);

  /**
   * On mount / note change, `key={note.id}` remounts this provider so `useState` reads storage.
   * Enqueue Rust registry sync here (same tick as first paint) so Tauri I/O is not ahead of registration.
   * `key={note.id}` で再マウント時は `useState` がストレージを読む。ここでは Rust 同期のみ即キュー。
   */
  useEffect(() => {
    const path = readNoteWorkspacePath(noteId);
    enqueueRustRegistrySync(async () => {
      if (path) {
        await registerNoteWorkspaceRoot(noteId, path);
      } else {
        await clearNoteWorkspaceRoot(noteId);
      }
    });
  }, [noteId, enqueueRustRegistrySync]);

  const setWorkspaceRoot = useCallback(
    (path: string) => {
      const normalized = path.trim();
      if (!normalized) {
        clearNoteWorkspacePath(noteId);
        setWorkspaceRootState(null);
        enqueueRustRegistrySync(async () => {
          await clearNoteWorkspaceRoot(noteId);
        });
        return;
      }
      writeNoteWorkspacePath(noteId, normalized);
      setWorkspaceRootState(normalized);
      enqueueRustRegistrySync(async () => {
        await registerNoteWorkspaceRoot(noteId, normalized);
      });
    },
    [noteId, enqueueRustRegistrySync],
  );

  const clearWorkspace = useCallback(() => {
    clearNoteWorkspacePath(noteId);
    setWorkspaceRootState(null);
    enqueueRustRegistrySync(async () => {
      await clearNoteWorkspaceRoot(noteId);
    });
  }, [noteId, enqueueRustRegistrySync]);

  const pickWorkspace = useCallback(async () => {
    const path = await pickNoteWorkspaceDirectory();
    if (path) setWorkspaceRoot(path);
  }, [setWorkspaceRoot]);

  const value = useMemo(
    () => ({
      noteId,
      workspaceRoot,
      setWorkspaceRoot,
      clearWorkspace,
      pickWorkspace,
    }),
    [noteId, workspaceRoot, setWorkspaceRoot, clearWorkspace, pickWorkspace],
  );

  return <NoteWorkspaceContext.Provider value={value}>{children}</NoteWorkspaceContext.Provider>;
}

/**
 * Optional hook: null when outside {@link NoteWorkspaceProvider}.
 * {@link NoteWorkspaceProvider} 外では null。
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook is paired with Provider in this module
export function useNoteWorkspaceOptional(): NoteWorkspaceContextValue | null {
  return useContext(NoteWorkspaceContext);
}
