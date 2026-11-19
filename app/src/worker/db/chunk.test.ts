import { describe, expect, it } from "vitest";
import { chunkForParams } from "./chunk";

describe("chunkForParams", () => {
  it("splits rows so each statement stays within D1's 100 bound parameters", () => {
    const rows = Array.from({ length: 30 }, (_, i) => i);
    const chunks = chunkForParams(rows, 7);
    expect(chunks.map((c) => c.length)).toEqual([14, 14, 2]);
    expect(chunks.flat()).toEqual(rows);
  });

  it("supports a custom parameter limit and rejects impossible widths", () => {
    expect(chunkForParams([1, 2, 3], 2, 4).map((c) => c.length)).toEqual([2, 1]);
    expect(() => chunkForParams([1], 101)).toThrow(RangeError);
  });

  it("returns no chunks for no rows", () => {
    expect(chunkForParams([], 3)).toEqual([]);
  });
});
