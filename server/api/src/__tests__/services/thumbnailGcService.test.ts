/**
 * `thumbnailGcService.deleteThumbnailObject` の振る舞いを検証する。
 * 所有者一致時に限り、ライブページの参照ガードを通過した場合だけ
 * DB → S3 の順で削除し、参照中なら `referenced` を返して削除を拒否、
 * 行が無ければ `not_found` を返すことを確認する。
 *
 * Tests for `thumbnailGcService.deleteThumbnailObject`: deletes the DB row
 * and S3 object only when (a) the owner predicate matches and (b) no
 * non-deleted `pages` row still references the thumbnail. Returns
 * `not_found` for missing/foreign rows, `referenced` when a live page row
 * still points at the object (issue #820), and swallows S3 failures so
 * callers can treat GC as best-effort.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockDb } from "../createMockDb.js";

const { mockS3Send, envMap } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
  envMap: {} as Record<string, string | undefined>,
}));

vi.mock("../../lib/env.js", () => ({
  getEnv: (key: string) => {
    const value = envMap[key];
    if (!value) throw new Error(`Missing required env var: ${key}`);
    return value;
  },
}));

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = (...args: unknown[]) => mockS3Send(...args);
  }
  function MockDeleteObjectCommand(input: unknown) {
    return input;
  }
  return { S3Client: MockS3Client, DeleteObjectCommand: MockDeleteObjectCommand };
});

function setBaseEnv() {
  envMap.STORAGE_ENDPOINT = "http://localhost:9000";
  envMap.STORAGE_ACCESS_KEY = "test-key";
  envMap.STORAGE_SECRET_KEY = "test-secret";
  envMap.STORAGE_BUCKET_NAME = "test-bucket";
}

async function importGcService() {
  return await import("../../services/thumbnailGcService.js");
}

describe("deleteThumbnailObject", () => {
  beforeEach(() => {
    setBaseEnv();
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});
    vi.resetModules();
  });

  // 各テスト後に console spy を確実に元に戻す。これを忘れると前のテストで貼った
  // `console.error` spy が次のテストの呼び出し履歴に紛れ込み、誤検知する。
  // Restore console spies between tests; otherwise a spy from one case leaks
  // its call history into the next one and produces false negatives.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("削除成功時は 'deleted' を返し S3 も削除する / returns 'deleted' and removes S3 object", async () => {
    const { deleteThumbnailObject } = await importGcService();
    // [ownership SELECT] [referrer SELECT — empty] [DELETE returning]
    const { db } = createMockDb([
      [{ id: "obj-1" }],
      [],
      [{ s3Key: "users/u1/thumbnails/abc.png" }],
    ]);

    await expect(deleteThumbnailObject("obj-1", "u1", db as never)).resolves.toBe("deleted");
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("所有者不一致なら 'not_found' を返し参照チェックも S3 も呼ばない / returns 'not_found' on ownership mismatch", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const { db, chains } = createMockDb([[]]);

    await expect(deleteThumbnailObject("obj-foreign", "u1", db as never)).resolves.toBe(
      "not_found",
    );
    expect(mockS3Send).not.toHaveBeenCalled();
    // ownership SELECT のみで終わる。参照チェックや DELETE は実行しない。
    // We stop after the ownership SELECT — no reference check or DELETE issued.
    expect(chains.filter((c) => c.startMethod === "delete")).toHaveLength(0);
  });

  it("生きているページが参照していれば 'referenced' を返し DELETE を発行しない / refuses delete when a live page references the thumbnail", async () => {
    const { deleteThumbnailObject } = await importGcService();
    // [ownership SELECT — found] [referrer SELECT — one live page]
    const { db, chains } = createMockDb([[{ id: "obj-2" }], [{ id: "page-live-1" }]]);

    await expect(deleteThumbnailObject("obj-2", "u1", db as never)).resolves.toBe("referenced");
    expect(mockS3Send).not.toHaveBeenCalled();
    expect(chains.filter((c) => c.startMethod === "delete")).toHaveLength(0);
  });

  it("他ユーザーのページが参照していてもブロックしない / foreign-owner referrer does not block deletion", async () => {
    // 第三者が `POST /api/pages` 経由で他人の `thumbnail_object_id` を指す
    // ダミーページを作成しても、参照ガードは所有者一致行のみを見るので
    // 被害者の DELETE は成功する。owner predicate が WHERE から外れている
    // と、攻撃者がガードを永久に発火させて被害者の容量枠を消費し続ける
    // DoS が成立してしまう（PR #839 のレビュー指摘）。
    //
    // A third party who plants a page that references another user's
    // thumbnail (POST /api/pages currently doesn't validate thumbnail
    // ownership) must not be able to lock the victim's GC. The guard
    // scopes its referrer SELECT to `pages.owner_id = userId`, so the
    // referrer SELECT here returns empty for the victim and the DELETE
    // proceeds. Without the owner predicate this would degenerate into a
    // permanent quota-burning DoS.
    const { deleteThumbnailObject } = await importGcService();
    // [ownership SELECT — found] [referrer SELECT — empty (owner-scoped)] [DELETE returning]
    const { db } = createMockDb([
      [{ id: "obj-foreign-ref" }],
      [],
      [{ s3Key: "users/u1/thumbnails/z.png" }],
    ]);

    await expect(deleteThumbnailObject("obj-foreign-ref", "u1", db as never)).resolves.toBe(
      "deleted",
    );
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("DELETE が 0 行返したら 'not_found' に縮退して S3 を呼ばない / DELETE returning 0 rows collapses to 'not_found'", async () => {
    const { deleteThumbnailObject } = await importGcService();
    // [ownership SELECT — found] [referrer SELECT — empty] [DELETE — 0 rows]
    const { db } = createMockDb([[{ id: "obj-3" }], [], []]);

    await expect(deleteThumbnailObject("obj-3", "u1", db as never)).resolves.toBe("not_found");
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("S3 削除失敗は飲み込んで throw しない / swallows S3 errors (best-effort GC)", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const { db } = createMockDb([[{ id: "obj-4" }], [], [{ s3Key: "users/u1/thumbnails/x.png" }]]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s3Err = Object.assign(new Error("network"), { name: "TimeoutError" });
    mockS3Send.mockRejectedValueOnce(s3Err);

    await expect(deleteThumbnailObject("obj-4", "u1", db as never)).resolves.toBe("deleted");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("NoSuchKey は冪等としてログ抑制 / NoSuchKey is treated as idempotent (no log)", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const { db } = createMockDb([[{ id: "obj-5" }], [], [{ s3Key: "users/u1/thumbnails/y.png" }]]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const noSuchKey = Object.assign(new Error("missing"), { name: "NoSuchKey" });
    mockS3Send.mockRejectedValueOnce(noSuchKey);

    await expect(deleteThumbnailObject("obj-5", "u1", db as never)).resolves.toBe("deleted");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
