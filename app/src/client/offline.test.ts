// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/query-core";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import {
  API_CACHE_PREFIX,
  clearOfflineData,
  isPermanentRefusal,
  pageDocName,
  pageOutbox,
  syncPendingPages,
} from "./offline";
import { API_CACHE } from "./sw/strategy";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  createPage: vi.fn(async () => undefined),
}));

const createDatabase = (name: string) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });

describe("clearOfflineData", () => {
  it("knows the name of the service worker's API cache", () => {
    expect(API_CACHE.startsWith(API_CACHE_PREFIX)).toBe(true);
  });

  it("deletes the local copies of pages and leaves other databases alone", async () => {
    await createDatabase(pageDocName("a"));
    await createDatabase(pageDocName("b"));
    await createDatabase("unrelated");

    await clearOfflineData();

    const names = (await indexedDB.databases()).map((db) => db.name);
    expect(names).toEqual(["unrelated"]);
  });

  it("forgets the pages this device had not sent", async () => {
    pageOutbox.add({ id: "p1", noteId: "n1", title: "draft", createdAt: 1 });

    await clearOfflineData();

    expect(pageOutbox.all()).toEqual([]);
    expect(JSON.parse(localStorage.getItem("zedi:outbox:pages") ?? "[]")).toEqual([]);
  });
});

describe("isPermanentRefusal", () => {
  it("gives up on refusals that a retry cannot fix", () => {
    for (const status of [400, 403, 404, 409, 410, 413, 422]) {
      expect(isPermanentRefusal(new ApiError(status, "refused")), String(status)).toBe(true);
    }
  });

  it("keeps the page for statuses that can succeed later", () => {
    // 401: オフライン中にセッションが切れた。408/425/429: 時間切れ・早すぎ・レート制限。
    // 401: the session expired while offline. 408/425/429: timeout, too early, rate limited.
    for (const status of [401, 408, 425, 429, 500, 503]) {
      expect(isPermanentRefusal(new ApiError(status, "later")), String(status)).toBe(false);
    }
    expect(isPermanentRefusal(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("syncPendingPages", () => {
  it("refreshes the lists, the page and the search results once a page reaches the server", async () => {
    // 作成直後のページが、同じ語の検索結果にすぐ出るようにする。
    // A page that was just created should show up when the same term is searched again.
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    pageOutbox.add({ id: "p2", noteId: "n1", title: "new", createdAt: 1 });

    const result = await syncPendingPages(client);

    expect(result.sent.map((p) => p.id)).toEqual(["p2"]);
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([["pages", "n1"], ["page", "p2"], ["search"]]));
  });
});
