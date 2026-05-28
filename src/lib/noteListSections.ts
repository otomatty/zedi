import type { NoteSummary } from "@/types/note";
import { isNotePinned } from "@/lib/notePinnedStorage";

/** Notes shown in the automatic "recent" block on `/notes`. / `/notes` の「最近」セクション件数 */
export const RECENT_SECTION_COUNT = 3;

/** Recent rows in the title switcher (excluding pinned). / スイッチャーの「最近」行数 */
export const SWITCHER_RECENT_COUNT = 5;

/**
 * Safe note title for UI (API may return null at runtime).
 * UI 向けタイトル（実行時に null があり得る）。
 */
export function resolveNoteDisplayTitle(
  title: string | null | undefined,
  untitledLabel: string,
): string {
  const trimmed = (title ?? "").trim();
  return trimmed.length > 0 ? trimmed : untitledLabel;
}

/**
 * Sort key for the "all notes" section on `/notes`.
 * `/notes` の「すべて」セクションの並び順。
 */
export type NoteListSort = "updated" | "title";

/**
 * Grouped note rows for `/notes` (pinned / recent / all).
 * `/notes` 向けのノート行グループ（よく使う / 最近 / すべて）。
 */
export interface NoteListSections {
  /** Default note + user pins. / 既定ノートとユーザーピン */
  pinned: NoteSummary[];
  /** Top N by `updatedAt` after pinned. / ピン以外の更新順上位 */
  recent: NoteSummary[];
  /** Remaining notes. / その他 */
  all: NoteSummary[];
}

/**
 * Live notes only (`!isDeleted`).
 * 論理削除されていないノートだけを返す。
 */
export function filterLiveNotes(notes: NoteSummary[]): NoteSummary[] {
  return notes.filter((note) => !note.isDeleted);
}

/**
 * Case-insensitive title filter.
 * タイトルの部分一致（大文字小文字無視）。
 */
export function filterNotesByTitle(notes: NoteSummary[], query: string): NoteSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((note) => (note.title || "").toLowerCase().includes(q));
}

/**
 * Sort notes for the "all" section.
 * 「すべて」セクション用のソート。
 */
export function sortNotes(notes: NoteSummary[], sort: NoteListSort): NoteSummary[] {
  const copy = [...notes];
  if (sort === "title") {
    copy.sort((a, b) =>
      (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }),
    );
    return copy;
  }
  copy.sort((a, b) => b.updatedAt - a.updatedAt);
  return copy;
}

/**
 * Ordered pinned ids: default note first, then user pins (deduped).
 * ピン表示順: 既定ノート → ユーザーピン（重複除去）。
 */
export function buildPinnedIdOrder(
  defaultNoteId: string | null,
  userPinnedIds: string[],
): string[] {
  const ordered: string[] = [];
  if (defaultNoteId) ordered.push(defaultNoteId);
  for (const id of userPinnedIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

/**
 * Resolve pinned section notes from ids.
 * ID 順にピンセクションのノートを並べる。
 */
export function resolvePinnedNotes(
  notesById: Map<string, NoteSummary>,
  pinnedIdOrder: string[],
): NoteSummary[] {
  const result: NoteSummary[] = [];
  for (const id of pinnedIdOrder) {
    const note = notesById.get(id);
    if (note) result.push(note);
  }
  return result;
}

/**
 * Split notes into pinned / recent / all for `/notes`.
 * `/notes` 用にピン・最近・すべてへ分割する。
 */
export function buildNoteListSections(
  notes: NoteSummary[],
  userPinnedIds: string[],
  defaultNoteId: string | null,
  options?: { recentCount?: number },
): NoteListSections {
  const recentCount = options?.recentCount ?? RECENT_SECTION_COUNT;
  const live = filterLiveNotes(notes);
  const byId = new Map(live.map((note) => [note.id, note]));

  const pinned = resolvePinnedNotes(byId, buildPinnedIdOrder(defaultNoteId, userPinnedIds));
  const pinnedSet = new Set(pinned.map((n) => n.id));

  const restByUpdated = live
    .filter((note) => !pinnedSet.has(note.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const recent = restByUpdated.slice(0, recentCount);
  const recentSet = new Set(recent.map((n) => n.id));

  const all = restByUpdated.filter((note) => !recentSet.has(note.id));

  return { pinned, recent, all };
}

/**
 * Notes shown in `NoteTitleSwitcher`: pinned block + recent (no full catalog).
 * タイトルスイッチャー用: ピン＋最近のみ（全件は載せない）。
 */
export function buildSwitcherNotes(
  notes: NoteSummary[],
  userPinnedIds: string[],
  defaultNoteId: string | null,
  options?: { recentCount?: number },
): NoteSummary[] {
  const recentCount = options?.recentCount ?? SWITCHER_RECENT_COUNT;
  const { pinned, recent } = buildNoteListSections(notes, userPinnedIds, defaultNoteId, {
    recentCount,
  });
  return [...pinned, ...recent];
}

export { isNotePinned };
