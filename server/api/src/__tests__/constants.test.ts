/**
 * 共通定数のテスト
 * Tests for shared constants
 */
import { describe, it, expect } from "vitest";
import { SNAPSHOT_INTERVAL_MS, MAX_SNAPSHOTS_PER_PAGE } from "../constants.js";

describe("SNAPSHOT_INTERVAL_MS", () => {
  it("is 10 minutes in milliseconds", () => {
    expect(SNAPSHOT_INTERVAL_MS).toBe(600_000);
  });
});

describe("MAX_SNAPSHOTS_PER_PAGE", () => {
  it("is 100", () => {
    expect(MAX_SNAPSHOTS_PER_PAGE).toBe(100);
  });
});
