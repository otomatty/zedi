import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isNotePinned,
  NOTE_PINNED_CHANGED_EVENT,
  NOTE_PINNED_STORAGE_KEY,
  readPinnedNoteIds,
  stripDefaultNoteFromPinnedIds,
  togglePinnedNoteId,
  writePinnedNoteIds,
} from "@/lib/notePinnedStorage";

/**
 * Options for {@link usePinnedNotes}.
 * {@link usePinnedNotes} のオプション。
 */
export interface UsePinnedNotesOptions {
  /** Resolved default note id; removed from persisted user pins when known. / 既定ノート ID（判明後はユーザーピンから除去） */
  defaultNoteId?: string | null;
}

/**
 * User-pinned note ids persisted in localStorage.
 * localStorage に保存するノートのピン留め状態。
 */
export function usePinnedNotes(options: UsePinnedNotesOptions = {}): {
  pinnedIds: string[];
  isPinned: (noteId: string) => boolean;
  togglePin: (noteId: string) => void;
} {
  const defaultNoteId = options.defaultNoteId ?? null;
  const [storedPinnedIds, setStoredPinnedIds] = useState<string[]>(() => readPinnedNoteIds());

  useEffect(() => {
    const sync = () => setStoredPinnedIds(readPinnedNoteIds());
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

  useEffect(() => {
    if (!defaultNoteId) return;
    const stored = readPinnedNoteIds();
    const next = stripDefaultNoteFromPinnedIds(stored, defaultNoteId);
    if (next.length === stored.length) return;
    writePinnedNoteIds(next);
    window.dispatchEvent(new Event(NOTE_PINNED_CHANGED_EVENT));
  }, [defaultNoteId]);

  const pinnedIds = useMemo(
    () => stripDefaultNoteFromPinnedIds(storedPinnedIds, defaultNoteId),
    [storedPinnedIds, defaultNoteId],
  );

  const togglePin = useCallback(
    (noteId: string) => {
      if (defaultNoteId && noteId === defaultNoteId) return;
      const current = stripDefaultNoteFromPinnedIds(readPinnedNoteIds(), defaultNoteId);
      const next = togglePinnedNoteId(noteId, current);
      setStoredPinnedIds(next);
      writePinnedNoteIds(next);
      window.dispatchEvent(new Event(NOTE_PINNED_CHANGED_EVENT));
    },
    [defaultNoteId],
  );

  const isPinned = useCallback((noteId: string) => isNotePinned(noteId, pinnedIds), [pinnedIds]);

  return { pinnedIds, isPinned, togglePin };
}
