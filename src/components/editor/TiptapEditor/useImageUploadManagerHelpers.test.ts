import { describe, it, expect } from "vitest";
import { filterImageFiles, filterVideoFiles } from "./useImageUploadManagerHelpers";

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array(1)], name, { type });
}

describe("filter helpers", () => {
  const files = [
    makeFile("a.png", "image/png"),
    makeFile("b.mp4", "video/mp4"),
    makeFile("c.webm", "video/webm"),
    makeFile("d.txt", "text/plain"),
  ];

  it("filterImageFiles keeps only image/* files", () => {
    expect(filterImageFiles(files).map((f) => f.name)).toEqual(["a.png"]);
  });

  it("filterVideoFiles keeps only video/* files", () => {
    expect(filterVideoFiles(files).map((f) => f.name)).toEqual(["b.mp4", "c.webm"]);
  });
});
