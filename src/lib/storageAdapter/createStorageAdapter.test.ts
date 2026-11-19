import { describe, it, expect } from "vitest";
import { createStorageAdapter } from "./createStorageAdapter";
import { IndexedDBStorageAdapter } from "./IndexedDBStorageAdapter";

describe("createStorageAdapter", () => {
  it("returns the IndexedDB adapter", () => {
    expect(createStorageAdapter()).toBeInstanceOf(IndexedDBStorageAdapter);
  });
});
