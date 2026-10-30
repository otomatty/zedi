import type { NoteListResponse, NoteSummary } from "../shared/types";

/**
 * Upper bound for one `list()` page. Large enough to load the whole PoC dataset at once.
 * 1 ページの最大件数。PoC のデータセット全体を一度に返せる値にしている。
 */
export const MAX_LIST_LIMIT = 10_000;

const SUBJECTS = [
  "知識ネットワーク",
  "Durable Objects",
  "Cloudflare Workers",
  "WikiLink",
  "読書メモ",
  "設計判断",
  "Hono",
  "Y.js",
  "リサーチ",
  "週次レビュー",
  "ProseMirror",
  "アイデア",
];
const SUFFIXES = ["のメモ", "の整理", "について", "の比較", "の下書き", "の要点", "Notes", "Draft"];
const TAGS = ["infra", "読書", "ai", "design", "日記", "research", "todo"];

/** Deterministic PRNG (mulberry32) so fixtures are reproducible across runs. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] as T;
}

/**
 * In-memory note store used by the PoC API (stands in for D1).
 * PoC の API が使うメモリ上のノートストア（D1 の代役）。
 */
export interface NoteStore {
  list(options: { offset: number; limit: number; query?: string }): NoteListResponse;
  get(id: string): NoteSummary | undefined;
}

/**
 * Creates a deterministic store of `count` fake notes.
 * `count` 件の決定的なダミーノートを持つストアを作る。
 */
export function createNoteStore({ count, seed }: { count: number; seed: number }): NoteStore {
  const random = createRandom(seed);
  const base = Date.UTC(2026, 9, 1);
  const notes: NoteSummary[] = Array.from({ length: count }, (_, index) => {
    const subject = pick(SUBJECTS, random);
    const title = `${subject}${pick(SUFFIXES, random)} ${index + 1}`;
    return {
      id: `note-${String(index + 1).padStart(5, "0")}`,
      title,
      preview: `${subject} に関する要点を ${Math.floor(random() * 9) + 1} 個まとめたページ。`,
      tags: [pick(TAGS, random), pick(TAGS, random)].filter((t, i, all) => all.indexOf(t) === i),
      updatedAt: new Date(
        base - index * 3_600_000 - Math.floor(random() * 3_600_000),
      ).toISOString(),
    };
  });
  const byId = new Map(notes.map((note) => [note.id, note]));

  return {
    list({ offset, limit, query }) {
      const needle = query?.trim().toLowerCase();
      const matched = needle ? notes.filter((n) => n.title.toLowerCase().includes(needle)) : notes;
      const size = Math.min(limit, MAX_LIST_LIMIT);
      return { items: matched.slice(offset, offset + size), total: matched.length };
    },
    get(id) {
      return byId.get(id);
    },
  };
}
