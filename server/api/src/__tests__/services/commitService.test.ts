/**
 * commitService のテスト。
 * BETTER_AUTH_URL 未設定時の fail-fast 挙動と、通常時の imageUrl 生成を検証する。
 *
 * Tests for commitService.
 * Verifies fail-fast behavior when BETTER_AUTH_URL is unset, and imageUrl
 * generation when the env is configured.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  function MockPutObjectCommand() {
    /* stub */
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
  };
});

vi.mock("../../services/subscriptionService.js", () => ({
  getUserTier: vi.fn().mockResolvedValue("free"),
}));

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";

const TEST_USER_ID = "user-test-123";
const DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

function setBaseEnv() {
  envMap.STORAGE_ENDPOINT = "http://localhost:9000";
  envMap.STORAGE_ACCESS_KEY = "test-key";
  envMap.STORAGE_SECRET_KEY = "test-secret";
  envMap.STORAGE_BUCKET_NAME = "test-bucket";
  envMap.BETTER_AUTH_URL = "https://zedi.example.com";
  process.env.STORAGE_BUCKET_NAME = "test-bucket";
}

function clearEnv() {
  for (const key of Object.keys(envMap)) {
    envMap[key] = undefined;
  }
  process.env.STORAGE_BUCKET_NAME = undefined;
}

async function importCommitService() {
  // 動的 import にして、モック適用後の最新モジュールを取得する。
  // Use dynamic import so the module picks up our mocks.
  return await import("../../services/commitService.js");
}

function makeDbMock(tier: string, quotaBytes: number, usedBytes: number) {
  // commitService は次の順番で DB を呼び出す:
  // 1) getUserTier (モック済み、DB は使わない)
  // 2) getStorageQuotaBytes: select().from().where().limit()
  // 3) getStorageUsedBytes: select().from().where()
  // 4) insert().values()
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

  let call = 0;
  const db = new Proxy(
    {},
    {
      get(_, prop: string) {
        return () => {
          if (prop === "select") {
            call++;
            if (call === 1) return chain([{ storageLimitBytes: quotaBytes }]);
            if (call === 2) return chain([{ sum: String(usedBytes) }]);
          }
          if (prop === "insert") return chain([]);
          return chain([]);
        };
      },
    },
  );
  return db;
}

describe("commitImage — BETTER_AUTH_URL handling", () => {
  beforeEach(() => {
    clearEnv();
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});
    vi.resetModules();
  });

  it("BETTER_AUTH_URL 未設定時は fail-fast で throw する / throws when BETTER_AUTH_URL is unset", async () => {
    setBaseEnv();
    envMap.BETTER_AUTH_URL = undefined;

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;

    await expect(commitImage(TEST_USER_ID, DATA_URI, undefined, db)).rejects.toThrow(
      /Missing required env var: BETTER_AUTH_URL/,
    );
  });

  it("BETTER_AUTH_URL 未設定時は S3 アップロード前に throw する / rejects before any S3 PUT when BETTER_AUTH_URL is unset", async () => {
    setBaseEnv();
    envMap.BETTER_AUTH_URL = undefined;

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;

    await expect(commitImage(TEST_USER_ID, DATA_URI, undefined, db)).rejects.toThrow(
      /Missing required env var: BETTER_AUTH_URL/,
    );

    // オーファンオブジェクトを生まないために、S3 への PUT が一切発生していないこと。
    // Verify we never hit S3 — otherwise a missing env leaves orphan objects.
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("BETTER_AUTH_URL が設定されていれば絶対 URL を返す / returns an absolute URL when BETTER_AUTH_URL is set", async () => {
    setBaseEnv();

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;

    const { imageUrl } = await commitImage(TEST_USER_ID, DATA_URI, undefined, db);

    expect(imageUrl).toMatch(/^https:\/\/zedi\.example\.com\/api\/thumbnail\/serve\/[0-9a-f-]+$/);
  });

  it("BETTER_AUTH_URL 末尾のスラッシュは除去される / trims trailing slash on BETTER_AUTH_URL", async () => {
    setBaseEnv();
    envMap.BETTER_AUTH_URL = "https://zedi.example.com/";

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;

    const { imageUrl } = await commitImage(TEST_USER_ID, DATA_URI, undefined, db);

    expect(imageUrl.startsWith("https://zedi.example.com/api/thumbnail/serve/")).toBe(true);
    expect(imageUrl.startsWith("https://zedi.example.com//")).toBe(false);
  });

  it("imageUrl と objectId のペアを返し、両者が一致する / returns matching imageUrl and objectId", async () => {
    setBaseEnv();

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;

    const { imageUrl, objectId } = await commitImage(TEST_USER_ID, DATA_URI, undefined, db);

    expect(objectId).toMatch(/^[0-9a-f-]+$/);
    expect(imageUrl.endsWith(`/api/thumbnail/serve/${objectId}`)).toBe(true);
  });

  it("クォータ未シードでも 100MB のフォールバックでアップロードできる / accepts upload using 100MB fallback when quota table is unseeded", async () => {
    setBaseEnv();

    const { commitImage } = await importCommitService();
    // クォータ行が無い（rows[] = []）状態を再現する。
    // Simulate the unseeded `thumbnail_tier_quotas` table.
    const db = new Proxy(
      {},
      {
        get(_, prop: string) {
          return () => {
            const chain = (final: unknown): unknown =>
              new Proxy(
                {},
                {
                  get(_t, p: string) {
                    if (p === "then") {
                      return (resolve?: (v: unknown) => unknown) =>
                        Promise.resolve(final).then(resolve);
                    }
                    return () => chain(final);
                  },
                },
              );
            if (prop === "select") return chain([]);
            if (prop === "insert") return chain([]);
            return chain([]);
          };
        },
      },
    ) as never;

    await expect(commitImage(TEST_USER_ID, DATA_URI, undefined, db)).resolves.toMatchObject({
      objectId: expect.stringMatching(/^[0-9a-f-]+$/),
    });
  });
});
