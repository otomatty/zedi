import { describe, expect, it } from "vitest";
import { parseHttpRangeToR2Range } from "../../../lib/storage/r2StorageClient.js";

describe("parseHttpRangeToR2Range", () => {
  it("parses bytes=start-end into offset and length", () => {
    expect(parseHttpRangeToR2Range("bytes=0-499")).toEqual({ offset: 0, length: 500 });
    expect(parseHttpRangeToR2Range("bytes=500-999")).toEqual({ offset: 500, length: 500 });
  });

  it("parses bytes=start- into open-ended offset", () => {
    expect(parseHttpRangeToR2Range("bytes=500-")).toEqual({ offset: 500 });
  });

  it("parses bytes=-suffix into suffix length", () => {
    expect(parseHttpRangeToR2Range("bytes=-500")).toEqual({ suffix: 500 });
  });

  it("returns undefined for unsupported or invalid range headers", () => {
    expect(parseHttpRangeToR2Range("bytes=0-499,500-999")).toBeUndefined();
    expect(parseHttpRangeToR2Range("items=0-1")).toBeUndefined();
    expect(parseHttpRangeToR2Range("bytes=10-5")).toBeUndefined();
    expect(parseHttpRangeToR2Range("bytes=-0")).toBeUndefined();
  });
});
