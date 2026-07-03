/**
 * commitService のテスト。
 * BETTER_AUTH_URL 未設定時の fail-fast 挙動と、通常時の imageUrl 生成を検証する。
 *
 * Tests for commitService.
 * Verifies fail-fast behavior when BETTER_AUTH_URL is unset, and imageUrl
 * generation when the env is configured.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StorageClient } from "../../lib/storage/types.js";

const { mockPutObject, envMap } = vi.hoisted(() => ({
  mockPutObject: vi.fn(),
  envMap: {} as Record<string, string | undefined>,
}));

vi.mock("../../lib/env.js", () => ({
  getEnv: (key: string) => {
    const value = envMap[key];
    if (!value) throw new Error(`Missing required env var: ${key}`);
    return value;
  },
}));

vi.mock("../../services/subscriptionService.js", () => ({
  getUserTier: vi.fn().mockResolvedValue("free"),
}));

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";

const TEST_USER_ID = "user-test-123";
const DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

function makeMockStorage(): StorageClient {
  return {
    putObject: mockPutObject,
    getObject: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
    getSignedPutUrl: vi.fn(),
  };
}

function setBaseEnv() {
  envMap.BETTER_AUTH_URL = "https://zedi.example.com";
}

function clearEnv() {
  for (const key of Object.keys(envMap)) {
    envMap[key] = undefined;
  }
}

async function importCommitService() {
  return await import("../../services/commitService.js");
}

function makeDbMock(_tier: string, quotaBytes: number, usedBytes: number) {
  let selectCount = 0;
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
  const db = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "select") {
          return () => {
            selectCount += 1;
            if (selectCount === 1) {
              return chain([{ storageLimitBytes: quotaBytes }]);
            }
            return chain([{ sum: String(usedBytes) }]);
          };
        }
        if (prop === "insert") return () => chain([]);
        return () => chain([]);
      },
    },
  );
  return db;
}

describe("commitImage — BETTER_AUTH_URL handling", () => {
  beforeEach(() => {
    clearEnv();
    mockPutObject.mockReset();
    mockPutObject.mockResolvedValue(undefined);
    vi.resetModules();
  });

  it("BETTER_AUTH_URL 未設定時は fail-fast で throw する / throws when BETTER_AUTH_URL is unset", async () => {
    setBaseEnv();
    envMap.BETTER_AUTH_URL = undefined;

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;
    const storage = makeMockStorage();

    await expect(commitImage(TEST_USER_ID, DATA_URI, undefined, db, storage)).rejects.toThrow(
      /Missing required env var: BETTER_AUTH_URL/,
    );
  });

  it("BETTER_AUTH_URL 未設定時は storage 書き込み前に throw する / rejects before any storage PUT when BETTER_AUTH_URL is unset", async () => {
    setBaseEnv();
    envMap.BETTER_AUTH_URL = undefined;

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;
    const storage = makeMockStorage();

    await expect(commitImage(TEST_USER_ID, DATA_URI, undefined, db, storage)).rejects.toThrow(
      /Missing required env var: BETTER_AUTH_URL/,
    );

    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it("BETTER_AUTH_URL が設定されていれば絶対 URL を返す / returns an absolute URL when BETTER_AUTH_URL is set", async () => {
    setBaseEnv();

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;
    const storage = makeMockStorage();

    const { imageUrl } = await commitImage(TEST_USER_ID, DATA_URI, undefined, db, storage);

    expect(imageUrl).toMatch(/^https:\/\/zedi\.example\.com\/api\/thumbnail\/serve\/[0-9a-f-]+$/);
  });

  it("BETTER_AUTH_URL 末尾のスラッシュは除去される / trims trailing slash on BETTER_AUTH_URL", async () => {
    setBaseEnv();
    envMap.BETTER_AUTH_URL = "https://zedi.example.com/";

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;
    const storage = makeMockStorage();

    const { imageUrl } = await commitImage(TEST_USER_ID, DATA_URI, undefined, db, storage);

    expect(imageUrl.startsWith("https://zedi.example.com/api/thumbnail/serve/")).toBe(true);
    expect(imageUrl.startsWith("https://zedi.example.com//")).toBe(false);
  });

  it("imageUrl と objectId のペアを返し、両者が一致する / returns matching imageUrl and objectId", async () => {
    setBaseEnv();

    const { commitImage } = await importCommitService();
    const db = makeDbMock("free", 10 * 1024 * 1024, 0) as never;
    const storage = makeMockStorage();

    const { imageUrl, objectId } = await commitImage(
      TEST_USER_ID,
      DATA_URI,
      undefined,
      db,
      storage,
    );

    expect(objectId).toMatch(/^[0-9a-f-]+$/);
    expect(imageUrl.endsWith(`/api/thumbnail/serve/${objectId}`)).toBe(true);
  });

  it("クォータ未シードでも 100MB のフォールバックでアップロードできる / accepts upload using 100MB fallback when quota table is unseeded", async () => {
    setBaseEnv();

    const { commitImage } = await importCommitService();
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
    const storage = makeMockStorage();

    await expect(
      commitImage(TEST_USER_ID, DATA_URI, undefined, db, storage),
    ).resolves.toMatchObject({
      objectId: expect.stringMatching(/^[0-9a-f-]+$/),
    });
  });
});
