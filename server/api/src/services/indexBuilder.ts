/**
 * Index builder service (P4, otomatty/zedi#598).
 *
 * Generates the contents of the special `__index__` page — a category
 * table-of-contents listing every non-deleted wiki page. The initial
 * implementation uses a deterministic rule-based categorization (first
 * character / language bucket) so it can run synchronously without an LLM
 * or embedding cluster; the hook is wired such that an LLM categorizer can
 * swap in later without changing callers.
 *
 * Karpathy LLM Wiki の `index.md` に相当する `__index__` 特殊ページの内容を
 * 生成する。初期実装は LLM を使わないルールベース（頭文字 / 言語別）で、
 * 将来 LLM / embedding クラスタに差し替え可能な形にしている。
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { pages } from "../schema/pages.js";
import { pageContents } from "../schema/pageContents.js";
import type { Database } from "../types/index.js";
import { ensureDefaultNote } from "./defaultNoteService.js";

/**
 * A single page entry as it appears in the index.
 * インデックスに並ぶ 1 ページ分の情報。
 */
export interface IndexEntry {
  /** Page ID. / ページ ID */
  id: string;
  /** Display title (falls back to "(無題 / untitled)"). / 表示タイトル */
  title: string;
  /** Most recent update timestamp as ISO 8601. / 最終更新時刻 (ISO 8601) */
  updatedAt: string;
}

/**
 * One category bucket of the index.
 * インデックスの 1 カテゴリ。
 */
export interface IndexCategory {
  /** Category label, e.g. "A", "日本語", "数字 / Numeric". / カテゴリ名 */
  label: string;
  /** Pages sorted by title within the category. / タイトル順のページ配列 */
  entries: IndexEntry[];
}

/**
 * Fully-built index document ready to persist.
 * 保存可能なインデックス本体。
 */
export interface IndexDocument {
  /** Total non-deleted pages considered. / 対象ページ総数 */
  totalPages: number;
  /** Pages that did not appear in any category. / どのカテゴリにも入らなかったページ（orphan 候補） */
  orphanCount: number;
  /** Categories sorted by label. / ラベル順のカテゴリ */
  categories: IndexCategory[];
  /** Markdown rendering of the index. / Markdown 表現 */
  markdown: string;
  /** When the document was built. / 構築時刻 */
  generatedAt: string;
}

/**
 * Returns a category label for a given title.
 *
 * - Empty / whitespace-only titles → "(無題 / Untitled)".
 * - ASCII letters → upper-cased first letter (A, B, ...).
 * - Digits → "0-9".
 * - Japanese characters (CJK ideographs, hiragana, katakana) → "日本語".
 * - Anything else → "その他 / Other".
 *
 * 頭文字からカテゴリラベルを算出する。アルファベットは大文字化、数字は
 * "0-9"、日本語（漢字・ひらがな・カタカナ）は "日本語"、それ以外は
 * "その他 / Other"。空タイトルは "(無題 / Untitled)"。
 *
 * @param title - Page title / ページタイトル
 * @returns Category label / カテゴリラベル
 */
export function categoryLabelFor(title: string | null | undefined): string {
  if (!title || title.trim().length === 0) return "(無題 / Untitled)";
  const first = [...title.trim()][0];
  if (!first) return "(無題 / Untitled)";
  if (/[0-9]/.test(first)) return "0-9";
  if (/[A-Za-z]/.test(first)) return first.toUpperCase();
  // Japanese ranges: CJK Unified Ideographs, Hiragana, Katakana (half-width too).
  // 日本語: CJK 漢字・ひらがな・カタカナ（半角含む）。
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF66-\uFF9F]/.test(first)) {
    return "日本語";
  }
  return "その他 / Other";
}

/**
 * Sorts category labels in a stable, reader-friendly order: digits first,
 * then Latin letters A-Z, then Japanese, then Other, then fallback sort.
 *
 * カテゴリ順序: 0-9 → A〜Z → 日本語 → その他 → ほか。
 */
export function compareCategoryLabels(a: string, b: string): number {
  const order = (label: string): number => {
    if (label === "0-9") return 0;
    if (/^[A-Z]$/.test(label)) return 1;
    if (label === "日本語") return 2;
    if (label === "その他 / Other") return 3;
    if (label === "(無題 / Untitled)") return 5;
    return 4;
  };
  const orderDiff = order(a) - order(b);
  if (orderDiff !== 0) return orderDiff;
  return a.localeCompare(b, "ja");
}

/**
 * Renders categories into a human-readable Markdown document.
 *
 * カテゴリ配列を Markdown 文字列に整形する。
 *
 * @param categories - Category array / カテゴリ配列
 * @param generatedAt - Timestamp string (ISO 8601) / 生成時刻 (ISO 8601)
 * @returns Markdown body / Markdown 本文
 */
export function renderIndexMarkdown(categories: IndexCategory[], generatedAt: string): string {
  const lines: string[] = [];
  lines.push("# Wiki Index / Wiki カテゴリ目次");
  lines.push("");
  lines.push(`_自動生成 / Auto-generated at ${generatedAt}. Karpathy LLM Wiki の index.md 相当。_`);
  lines.push("");

  if (categories.length === 0) {
    lines.push("まだページがありません。 / No pages yet.");
    return lines.join("\n");
  }

  for (const category of categories) {
    lines.push(`## ${category.label}`);
    lines.push("");
    for (const entry of category.entries) {
      const displayTitle = entry.title.trim().length === 0 ? "(無題 / untitled)" : entry.title;
      lines.push(`- [[${displayTitle}]]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Groups pages into categories and produces a full {@link IndexDocument}.
 * Useful as a pure helper in tests.
 *
 * ページ配列をカテゴリに分け、{@link IndexDocument} を生成する純関数。
 * テスト向けに DB 非依存で公開する。
 *
 * @param rawPages - 対象ページ配列 / Input pages
 * @param now - Generation timestamp / 生成時刻（省略時は new Date()）
 */
export function buildIndexFromPages(
  rawPages: ReadonlyArray<{ id: string; title: string | null; updatedAt: Date | string }>,
  now: Date = new Date(),
): IndexDocument {
  const bucketMap = new Map<string, IndexEntry[]>();

  for (const p of rawPages) {
    const label = categoryLabelFor(p.title);
    const updatedAtIso = p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt;
    const entry: IndexEntry = {
      id: p.id,
      title: p.title ?? "",
      updatedAt: updatedAtIso,
    };
    const bucket = bucketMap.get(label);
    if (bucket) {
      bucket.push(entry);
    } else {
      bucketMap.set(label, [entry]);
    }
  }

  const categories: IndexCategory[] = [...bucketMap.entries()]
    .map(([label, entries]) => ({
      label,
      entries: [...entries].sort((a, b) => a.title.localeCompare(b.title, "ja")),
    }))
    .sort((a, b) => compareCategoryLabels(a.label, b.label));

  const generatedAt = now.toISOString();
  const markdown = renderIndexMarkdown(categories, generatedAt);

  return {
    totalPages: rawPages.length,
    orphanCount: 0,
    categories,
    markdown,
    generatedAt,
  };
}

/**
 * Builds an index document for a user by querying all non-deleted, non-special
 * pages. Schema pages and the `__index__` / `__log__` pages themselves are
 * excluded from the index listing.
 *
 * 指定ユーザーの非削除・非特殊ページ全件から `IndexDocument` を組み立てる。
 * スキーマ・`__index__` / `__log__` 自体は一覧に含めない。
 *
 * @param db - Database connection / データベース接続
 * @param ownerId - Owner user ID / 対象ユーザー ID
 * @returns Built index document / 組み立て済みインデックス
 */
export async function buildIndexForOwner(db: Database, ownerId: string): Promise<IndexDocument> {
  const rows = await db
    .select({ id: pages.id, title: pages.title, updatedAt: pages.updatedAt })
    .from(pages)
    .where(
      and(
        eq(pages.ownerId, ownerId),
        eq(pages.isDeleted, false),
        eq(pages.isSchema, false),
        // `specialKind` IS NULL => normal pages; special pages excluded.
        // `specialKind` が NULL のページのみ対象。
        isNull(pages.specialKind),
      ),
    )
    .orderBy(asc(pages.title));

  return buildIndexFromPages(rows);
}

/** Title of the special `__index__` page. / `__index__` 特殊ページのタイトル。 */
export const INDEX_PAGE_TITLE = "__index__";

/**
 * Result of persisting an index page.
 * インデックスページ保存結果。
 */
export interface PersistIndexResult {
  /** Page ID of the `__index__` page (created or updated). / `__index__` ページ ID */
  pageId: string;
  /**
   * Owning note id of the `__index__` page. Returned so the client can build
   * `/notes/:noteId/:pageId` after Issue #889 Phase 3 retired `/pages/:id`.
   * 所属ノート ID。Issue #889 Phase 3 で `/pages/:id` を撤去したため、クライアント
   * が `/notes/:noteId/:pageId` を組み立てる用に返す。
   */
  noteId: string;
  /** Whether a new page row was created. / 新規作成されたか */
  created: boolean;
  /** Built document. / 生成したドキュメント */
  document: IndexDocument;
}

/**
 * Builds the index document for a user and upserts it into a special page
 * (`special_kind = '__index__'`). The body is stored in `page_contents.content_text`
 * so normal reads (GET /api/pages/:id, search) work unchanged.
 *
 * ユーザーの `__index__` 特殊ページを upsert する。本文は
 * `page_contents.content_text` に格納し、通常ページと同じ読み出し経路で扱える。
 *
 * @param db - Database connection / データベース接続
 * @param ownerId - Owner user ID / 対象ユーザー ID
 */
export async function rebuildIndexForOwner(
  db: Database,
  ownerId: string,
): Promise<PersistIndexResult> {
  const document = await buildIndexForOwner(db, ownerId);
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: pages.id, noteId: pages.noteId })
      .from(pages)
      .where(
        and(
          eq(pages.ownerId, ownerId),
          eq(pages.specialKind, "__index__"),
          eq(pages.isDeleted, false),
        ),
      )
      .for("update")
      .limit(1);

    let pageId: string;
    let noteId: string;
    let created: boolean;
    if (existing) {
      await tx
        .update(pages)
        .set({ title: INDEX_PAGE_TITLE, updatedAt: now })
        .where(eq(pages.id, existing.id));
      pageId = existing.id;
      noteId = existing.noteId;
      created = false;
    } else {
      // Partial unique index (`idx_pages_unique_special_kind_per_owner`) protects
      // against two concurrent rebuilds both passing the SELECT above and then
      // racing to INSERT. Use ON CONFLICT DO NOTHING + re-SELECT so the loser
      // adopts the winner's row instead of aborting the whole transaction
      // (a raw unique violation in Postgres marks the tx as failed, and a
      // try/catch alone cannot recover without an explicit SAVEPOINT).
      // 並行再構築で SELECT を両方通過した場合、生の一意制約違反は tx を失敗状態に
      // するため、ON CONFLICT DO NOTHING + 再 SELECT で勝者行を採用する。
      const defaultNote = await ensureDefaultNote(tx, ownerId);
      const inserted = await tx
        .insert(pages)
        .values({
          ownerId,
          noteId: defaultNote.id,
          title: INDEX_PAGE_TITLE,
          specialKind: "__index__",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: pages.id, noteId: pages.noteId });
      const newRow = inserted[0];
      if (newRow) {
        pageId = newRow.id;
        noteId = newRow.noteId;
        created = true;
      } else {
        const [winner] = await tx
          .select({ id: pages.id, noteId: pages.noteId })
          .from(pages)
          .where(
            and(
              eq(pages.ownerId, ownerId),
              eq(pages.specialKind, "__index__"),
              eq(pages.isDeleted, false),
            ),
          )
          .limit(1);
        if (!winner) {
          throw new Error("Failed to insert or locate __index__ page");
        }
        pageId = winner.id;
        noteId = winner.noteId;
        created = false;
      }
    }

    await tx
      .insert(pageContents)
      .values({
        pageId,
        ydocState: Buffer.alloc(0),
        contentText: document.markdown,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pageContents.pageId,
        set: { contentText: document.markdown, updatedAt: now },
      });

    return { pageId, noteId, created };
  });

  return { ...result, document };
}
