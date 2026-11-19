import { describe, expect, it } from "vitest";
import { filterItems, moveActive } from "./listbox";

const items = [
  { id: "1", label: "Cloudflare Workers" },
  { id: "2", label: "Durable Objects と Workers" },
  { id: "3", label: "workers 入門" },
  { id: "4", label: "Hono" },
];

describe("filterItems", () => {
  it("returns all items (up to the limit) for an empty query", () => {
    expect(filterItems(items, "  ")).toEqual(items);
    expect(filterItems(items, "", 2)).toEqual(items.slice(0, 2));
  });

  it("matches case-insensitively and ranks prefix matches before substring matches", () => {
    expect(filterItems(items, "WORKERS").map((i) => i.id)).toEqual(["3", "1", "2"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterItems(items, "zzz")).toEqual([]);
  });
});

describe("moveActive", () => {
  it("moves within bounds and wraps around both ends", () => {
    expect(moveActive(0, 1, 3)).toBe(1);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
  });

  it("returns -1 for an empty list", () => {
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
});
