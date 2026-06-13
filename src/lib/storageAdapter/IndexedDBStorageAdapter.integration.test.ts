/**
 * fake-indexeddb を用いた IndexedDBStorageAdapter の統合テスト。
 * 実際の IndexedDB 経路（変換・クエリ・移行）を通すことでミュータント検出力を確保する。
 * y-indexeddb 依存の Y.Doc state 系メソッドはタイマー依存で不安定なため対象外。
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IndexedDBStorageAdapter } from "./IndexedDBStorageAdapter";
import type { GhostLink, Link, PageMetadata } from "./types";

const DB_NAME_PREFIX = "zedi-storage-";

function makePage(overrides: Partial<PageMetadata> = {}): PageMetadata {
  return {
    id: crypto.randomUUID(),
    ownerId: "owner-1",
    noteId: "note-1",
    sourcePageId: null,
    title: "Title",
    contentPreview: "preview",
    thumbnailUrl: null,
    sourceUrl: null,
    createdAt: 1000,
    updatedAt: 2000,
    isDeleted: false,
    ...overrides,
  };
}

/** 旧個人ページ時代の `noteId: null` 行を生 IDB 経由で挿入する。 */
async function putLegacyNullPage(userId: string, id: string): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME_PREFIX + userId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("my_pages", "readwrite");
      tx.objectStore("my_pages").put({
        id,
        ownerId: "owner-1",
        noteId: null,
        sourcePageId: null,
        title: "legacy",
        contentPreview: null,
        thumbnailUrl: null,
        sourceUrl: null,
        createdAt: 500,
        updatedAt: 500,
        isDeleted: false,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

describe("IndexedDBStorageAdapter (fake-indexeddb integration)", () => {
  let adapter: IndexedDBStorageAdapter;
  let userId: string;

  beforeEach(async () => {
    adapter = new IndexedDBStorageAdapter();
    userId = crypto.randomUUID();
    await adapter.initialize(userId);
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe("page CRUD", () => {
    it("upsertPage で保存した全フィールドが getPage で往復する", async () => {
      const page = makePage({
        sourcePageId: "src-1",
        thumbnailUrl: "http://t",
        sourceUrl: "http://s",
      });

      await adapter.upsertPage(page);

      expect(await adapter.getPage(page.id)).toEqual(page);
    });

    it("存在しないページは null を返す", async () => {
      expect(await adapter.getPage("missing")).toBeNull();
    });

    it("論理削除済みページは getPage で null になる", async () => {
      const page = makePage();
      await adapter.upsertPage(page);

      await adapter.deletePage(page.id);

      expect(await adapter.getPage(page.id)).toBeNull();
    });

    it("deletePage は存在しない id では何もしない", async () => {
      await expect(adapter.deletePage("missing")).resolves.toBeUndefined();
    });

    it("getAllPages は削除済みを除外し updatedAt 降順で返す", async () => {
      const older = makePage({ updatedAt: 1000 });
      const newer = makePage({ updatedAt: 5000 });
      const deleted = makePage({ updatedAt: 9000, isDeleted: true });
      await adapter.upsertPage(older);
      await adapter.upsertPage(newer);
      await adapter.upsertPage(deleted);

      const list = await adapter.getAllPages();

      expect(list.map((p) => p.id)).toEqual([newer.id, older.id]);
    });

    it("getAllPages は noteId が null のレガシー行を除外する", async () => {
      const valid = makePage();
      await adapter.upsertPage(valid);
      await putLegacyNullPage(userId, "legacy-1");

      const list = await adapter.getAllPages();

      expect(list.map((p) => p.id)).toEqual([valid.id]);
    });
  });

  describe("reassignNullNotePages", () => {
    it("レガシー null 行を指定ノートへ付け替える", async () => {
      const valid = makePage();
      await adapter.upsertPage(valid);
      await putLegacyNullPage(userId, "legacy-1");

      await adapter.reassignNullNotePages("note-x");

      const list = await adapter.getAllPages();
      const adopted = list.find((p) => p.id === "legacy-1");
      expect(adopted?.noteId).toBe("note-x");
      expect(list).toHaveLength(2);
    });

    it("レガシー行が無ければ冪等に完了する（高速パス）", async () => {
      await adapter.upsertPage(makePage());

      await expect(adapter.reassignNullNotePages("note-x")).resolves.toBeUndefined();
    });
  });

  describe("links", () => {
    const link = (sourceId: string, targetId: string): Link => ({
      sourceId,
      targetId,
      linkType: "wiki",
      createdAt: 100,
    });

    it("saveLinks / getLinks が往復し、linkType で絞り込める", async () => {
      await adapter.saveLinks("A", [link("A", "B"), link("A", "C")], "wiki");

      expect(await adapter.getLinks("A")).toHaveLength(2);
      expect(await adapter.getLinks("A", "wiki")).toHaveLength(2);
      expect(await adapter.getLinks("A", "tag")).toHaveLength(0);
    });

    it("saveLinks は同 linkType のみ置換し、他種別は保持する", async () => {
      await adapter.saveLinks("A", [link("A", "B")], "wiki");
      await adapter.saveLinks("A", [link("A", "T")], "tag");

      // tag を空で保存しても wiki は残る
      await adapter.saveLinks("A", [], "tag");

      const all = await adapter.getLinks("A");
      expect(all).toHaveLength(1);
      expect(all[0].linkType).toBe("wiki");
    });

    it("getBacklinks は target 宛のリンクを返し linkType で絞れる", async () => {
      await adapter.saveLinks("A", [link("A", "Z")], "wiki");
      await adapter.saveLinks("B", [{ ...link("B", "Z"), linkType: "tag" }], "tag");

      expect(await adapter.getBacklinks("Z")).toHaveLength(2);
      expect(await adapter.getBacklinks("Z", "wiki")).toEqual([
        { sourceId: "A", targetId: "Z", linkType: "wiki", createdAt: 100 },
      ]);
    });
  });

  describe("ghost links", () => {
    const ghost = (linkText: string, sourcePageId: string): GhostLink => ({
      linkText,
      sourcePageId,
      linkType: "wiki",
      createdAt: 100,
      originalTargetPageId: "orig-page",
      originalNoteId: "orig-note",
    });

    it("saveGhostLinks / getGhostLinks が original 情報込みで往復する", async () => {
      await adapter.saveGhostLinks("A", [ghost("[[X]]", "A")], "wiki");

      const links = await adapter.getGhostLinks("A");
      expect(links).toEqual([
        {
          linkText: "[[X]]",
          sourcePageId: "A",
          linkType: "wiki",
          createdAt: 100,
          originalTargetPageId: "orig-page",
          originalNoteId: "orig-note",
        },
      ]);
    });

    it("saveGhostLinks は linkType スコープで置換する", async () => {
      await adapter.saveGhostLinks("A", [ghost("[[X]]", "A")], "wiki");
      await adapter.saveGhostLinks("A", [{ ...ghost("#tag", "A"), linkType: "tag" }], "tag");

      await adapter.saveGhostLinks("A", [], "wiki");

      const remaining = await adapter.getGhostLinks("A");
      expect(remaining).toHaveLength(1);
      expect(remaining[0].linkType).toBe("tag");
    });
  });

  describe("search", () => {
    it("updateSearchIndex 後に部分一致でページタイトル付き結果を返す", async () => {
      const page = makePage({ title: "My Page" });
      await adapter.upsertPage(page);
      await adapter.updateSearchIndex(page.id, "the quick brown fox");

      const results = await adapter.searchPages("Quick");

      expect(results).toEqual([
        { pageId: page.id, title: "My Page", snippet: "the quick brown fox" },
      ]);
    });

    it("スニペットは 200 文字に切り詰められる", async () => {
      const page = makePage();
      await adapter.upsertPage(page);
      await adapter.updateSearchIndex(page.id, "x".repeat(500));

      const [result] = await adapter.searchPages("xxx");

      expect(result.snippet).toHaveLength(200);
    });

    it("空クエリは検索せず空配列を返す", async () => {
      await adapter.updateSearchIndex("p1", "hello");

      expect(await adapter.searchPages("   ")).toEqual([]);
    });

    it("一致が無ければ空配列を返す", async () => {
      await adapter.updateSearchIndex("p1", "hello");

      expect(await adapter.searchPages("zzz")).toEqual([]);
    });
  });

  describe("sync metadata", () => {
    it("getLastSyncTime は未設定で 0 を返す", async () => {
      expect(await adapter.getLastSyncTime()).toBe(0);
    });

    it("setLastSyncTime で保存した値を返す", async () => {
      await adapter.setLastSyncTime(123456);

      expect(await adapter.getLastSyncTime()).toBe(123456);
    });
  });

  describe("resetDatabase", () => {
    it("DB を削除し、再初期化後は空になる", async () => {
      await adapter.upsertPage(makePage());
      expect(await adapter.getAllPages()).toHaveLength(1);

      await adapter.resetDatabase();
      await adapter.initialize(userId);

      expect(await adapter.getAllPages()).toEqual([]);
    });
  });
});
