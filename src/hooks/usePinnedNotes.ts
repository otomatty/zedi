import { useCallback, useEffect, useState } from "react";
import {
  isNotePinned,
  NOTE_PINNED_CHANGED_EVENT,
  NOTE_PINNED_STORAGE_KEY,
  readPinnedNoteIds,
  togglePinnedNoteId,
  writePinnedNoteIds,
} from "@/lib/notePinnedStorage";

/**
 * User-pinned note ids persisted in localStorage.
 * localStorage に保存するノートのピン留め状態。
 */
export function usePinnedNotes(): {
  pinnedIds: string[];
  isPinned: (noteId: string) => boolean;
  togglePin: (noteId: string) => void;
} {
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => readPinnedNoteIds());

  useEffect(() => {
    const sync = () => setPinnedIds(readPinnedNoteIds());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === NOTE_PINNED_STORAGE_KEY) {
        sync();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(NOTE_PINNED_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(NOTE_PINNED_CHANGED_EVENT, sync);
    };
  }, []);

  const togglePin = useCallback((noteId: string) => {
    setPinnedIds((current) => {
      const next = togglePinnedNoteId(noteId, current);
      writePinnedNoteIds(next);
      window.dispatchEvent(new Event(NOTE_PINNED_CHANGED_EVENT));
      return next;
    });
  }, []);

  const isPinned = useCallback((noteId: string) => isNotePinned(noteId, pinnedIds), [pinnedIds]);

  return { pinnedIds, isPinned, togglePin };
}
