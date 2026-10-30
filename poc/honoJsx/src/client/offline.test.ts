// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { API_CACHE_PREFIX, clearOfflineData, pageDocName } from "./offline";
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
});
