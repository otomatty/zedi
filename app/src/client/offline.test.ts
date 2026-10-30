// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import {
  API_CACHE_PREFIX,
  clearOfflineData,
  isPermanentRefusal,
  pageDocName,
  pageOutbox,
} from "./offline";
import { API_CACHE } from "./sw/strategy";

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
