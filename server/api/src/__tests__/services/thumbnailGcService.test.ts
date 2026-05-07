/**
 * `thumbnailGcService.deleteThumbnailObject` の振る舞いを検証する。
 * 所有者一致時のみ DB → S3 の順で削除し、行が無ければ no-op、
 * S3 失敗時は例外を伝播せずログだけ残すことを確認する。
 *
 * Tests for `thumbnailGcService.deleteThumbnailObject`: deletes the DB row
 * and S3 object only when the owner-scoped DELETE returns a row, no-ops
 * otherwise, and swallows S3 failures (logs but never throws) so callers
 * can treat GC as best-effort.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

function makeDbWithDeleteResult(returningRows: Array<{ s3Key: string }>) {
  // db.delete().where().returning() の最終戻り値だけ制御できれば十分。
  // We only need to control the final returning() value of delete().where().returning().
  const chain = (final: unknown) =>
    new Proxy(
      {},
      {
        get(_, prop: string) {
          if (prop === "then") {
            return (resolve?: (v: unknown) => unknown) => Promise.resolve(final).then(resolve);
          }
          return () => chain(final);
        },
      },
    );

  return new Proxy(
    {},
    {
      get(_, prop: string) {
        return () => chain(returningRows);
      },
    },
  );
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

  it("行が削除された場合は S3 も削除する / deletes S3 object when DB row was removed", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const db = makeDbWithDeleteResult([{ s3Key: "users/u1/thumbnails/abc.png" }]) as never;

    await deleteThumbnailObject("obj-1", "u1", db);

    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("DB 行が無ければ S3 を呼ばない / skips S3 call when no row was deleted", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const db = makeDbWithDeleteResult([]) as never;

    await deleteThumbnailObject("obj-missing", "u1", db);

    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("S3 削除失敗は飲み込んで throw しない / swallows S3 errors (best-effort GC)", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const db = makeDbWithDeleteResult([{ s3Key: "users/u1/thumbnails/x.png" }]) as never;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s3Err = Object.assign(new Error("network"), { name: "TimeoutError" });
    mockS3Send.mockRejectedValueOnce(s3Err);

    await expect(deleteThumbnailObject("obj-2", "u1", db)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("NoSuchKey は冪等としてログ抑制 / NoSuchKey is treated as idempotent (no log)", async () => {
    const { deleteThumbnailObject } = await importGcService();
    const db = makeDbWithDeleteResult([{ s3Key: "users/u1/thumbnails/y.png" }]) as never;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const noSuchKey = Object.assign(new Error("missing"), { name: "NoSuchKey" });
    mockS3Send.mockRejectedValueOnce(noSuchKey);

    await deleteThumbnailObject("obj-3", "u1", db);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
