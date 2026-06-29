/**
 * `thumbnailGcService.deleteThumbnailObject` の振る舞いを検証する。
 * 所有者一致時に限り、ライブページの参照ガードを通過した場合だけ
 * DB → storage の順で削除し、参照中なら `referenced` を返して削除を拒否、
 * 行が無ければ `not_found` を返すことを確認する。
 *
 * Tests for `thumbnailGcService.deleteThumbnailObject`: deletes the DB row
 * and storage object only when (a) the owner predicate matches and (b) no
 * non-deleted `pages` row still references the thumbnail. Returns
 * `not_found` for missing/foreign rows, `referenced` when a live page row
 * still points at the object (issue #820), and swallows storage failures so
 * callers can treat GC as best-effort.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockDb } from "../createMockDb.js";
import type { StorageClient } from "../../lib/storage/types.js";

const { mockDeleteObject } = vi.hoisted(() => ({
  mockDeleteObject: vi.fn(),
}));

function makeMockStorage(): StorageClient {
  return {
    putObject: vi.fn(),
    getObject: vi.fn(),
    headObject: vi.fn(),
    deleteObject: mockDeleteObject,
    getSignedPutUrl: vi.fn(),
  };
}

async function importGcService() {
  return await import("../../services/thumbnailGcService.js");
}

describe("deleteThumbnailObject", () => {
  beforeEach(() => {
    mockDeleteObject.mockReset();
    mockDeleteObject.mockResolvedValue(undefined);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("削除成功時は 'deleted' を返し storage も削除する / returns 'deleted' and removes storage object", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const storage = makeMockStorage();
    const { db } = createMockDb([
      [{ id: "obj-1" }],
      [],
      [{ s3Key: "users/u1/thumbnails/abc.png" }],
    ]);

    await expect(deleteThumbnailObject("obj-1", "u1", db as never, storage)).resolves.toBe(
      "deleted",
    );
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
  });

  it("所有者不一致なら 'not_found' を返し参照チェックも storage も呼ばない / returns 'not_found' on ownership mismatch", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const storage = makeMockStorage();
    const { db, chains } = createMockDb([[]]);

    await expect(deleteThumbnailObject("obj-foreign", "u1", db as never, storage)).resolves.toBe(
      "not_found",
    );
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(chains.filter((c) => c.startMethod === "delete")).toHaveLength(0);
  });

  it("生きているページが参照していれば 'referenced' を返し DELETE を発行しない / refuses delete when a live page references the thumbnail", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const storage = makeMockStorage();
    const { db, chains } = createMockDb([[{ id: "obj-2" }], [{ id: "page-live-1" }]]);

    await expect(deleteThumbnailObject("obj-2", "u1", db as never, storage)).resolves.toBe(
      "referenced",
    );
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(chains.filter((c) => c.startMethod === "delete")).toHaveLength(0);
  });

  it("他ユーザーのページが参照していてもブロックしない / foreign-owner referrer does not block deletion", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const storage = makeMockStorage();
    const { db } = createMockDb([
      [{ id: "obj-foreign-ref" }],
      [],
      [{ s3Key: "users/u1/thumbnails/z.png" }],
    ]);

    await expect(
      deleteThumbnailObject("obj-foreign-ref", "u1", db as never, storage),
    ).resolves.toBe("deleted");
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
  });

  it("DELETE が 0 行返したら 'not_found' に縮退して storage を呼ばない / DELETE returning 0 rows collapses to 'not_found'", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const storage = makeMockStorage();
    const { db } = createMockDb([[{ id: "obj-3" }], [], []]);

    await expect(deleteThumbnailObject("obj-3", "u1", db as never, storage)).resolves.toBe(
      "not_found",
    );
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("storage 削除失敗は飲み込んで throw しない / swallows storage errors (best-effort GC)", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const storage = makeMockStorage();
    const { db } = createMockDb([[{ id: "obj-4" }], [], [{ s3Key: "users/u1/thumbnails/x.png" }]]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const storageErr = Object.assign(new Error("network"), { name: "TimeoutError" });
    mockDeleteObject.mockRejectedValueOnce(storageErr);

    await expect(deleteThumbnailObject("obj-4", "u1", db as never, storage)).resolves.toBe(
      "deleted",
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it("NoSuchKey は冪等としてログ抑制 / NoSuchKey is treated as idempotent (no log)", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const storage = makeMockStorage();
    const { db } = createMockDb([[{ id: "obj-5" }], [], [{ s3Key: "users/u1/thumbnails/y.png" }]]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const noSuchKey = Object.assign(new Error("missing"), { name: "NoSuchKey" });
    mockDeleteObject.mockRejectedValueOnce(noSuchKey);

    await expect(deleteThumbnailObject("obj-5", "u1", db as never, storage)).resolves.toBe(
      "deleted",
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
