import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";

describe("page list cursor", () => {
  it("round-trips the keyset position", () => {
    const cursor = encodeCursor({ updatedAt: 1_700_000_000_000, id: "page-1" });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual({ updatedAt: 1_700_000_000_000, id: "page-1" });
  });

  it.each([
    ["not-base64!!"],
    [""],
    [encodeURIComponent("e30")],
    ["eyJ1cGRhdGVkQXQiOiJ4IiwiaWQiOjF9"],
  ])("rejects a malformed cursor %j", (raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });
});
