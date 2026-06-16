import { describe, it, expect } from "vitest";
import { isAnimatedPng } from "./isAnimatedPng";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 4 バイトのビッグエンディアン長表現 */
function uint32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** PNG チャンク（length + type + data + CRC プレースホルダ）を組み立てる */
function chunk(type: string, data: number[] = []): number[] {
  return [
    ...uint32be(data.length),
    ...[...type].map((c) => c.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0, // CRC（判定では未使用なのでダミー）
  ];
}

/** シグネチャ + 任意のチャンク列から PNG ファイルを作る */
function buildPng(chunks: number[][]): File {
  const bytes = new Uint8Array([...PNG_SIGNATURE, ...chunks.flat()]);
  return new File([bytes], "test.png", { type: "image/png" });
}

describe("isAnimatedPng", () => {
  it("returns true for APNG (acTL before IDAT)", async () => {
    const file = buildPng([
      chunk("IHDR", new Array(13).fill(0)),
      chunk("acTL", new Array(8).fill(0)),
      chunk("IDAT", new Array(10).fill(0)),
      chunk("IEND"),
    ]);
    expect(await isAnimatedPng(file)).toBe(true);
  });

  it("skips chunk data correctly when a large chunk precedes acTL", async () => {
    const file = buildPng([
      chunk("IHDR", new Array(13).fill(0)),
      chunk("iCCP", new Array(256).fill(7)),
      chunk("acTL", new Array(8).fill(0)),
      chunk("IDAT", new Array(10).fill(0)),
    ]);
    expect(await isAnimatedPng(file)).toBe(true);
  });

  it("returns false for a static PNG (no acTL)", async () => {
    const file = buildPng([
      chunk("IHDR", new Array(13).fill(0)),
      chunk("IDAT", new Array(10).fill(0)),
      chunk("IEND"),
    ]);
    expect(await isAnimatedPng(file)).toBe(false);
  });

  it("returns false when acTL appears only after IDAT (not a valid APNG)", async () => {
    const file = buildPng([
      chunk("IHDR", new Array(13).fill(0)),
      chunk("IDAT", new Array(10).fill(0)),
      chunk("acTL", new Array(8).fill(0)),
    ]);
    expect(await isAnimatedPng(file)).toBe(false);
  });

  it("returns false for a non-PNG file (wrong signature)", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], "x.jpg", {
      type: "image/jpeg",
    });
    expect(await isAnimatedPng(file)).toBe(false);
  });

  it("returns false for truncated / tiny data", async () => {
    const file = new File([new Uint8Array([0x89, 0x50])], "tiny.png", { type: "image/png" });
    expect(await isAnimatedPng(file)).toBe(false);
  });

  it("returns false for an empty file", async () => {
    const file = new File([new Uint8Array([])], "empty.png", { type: "image/png" });
    expect(await isAnimatedPng(file)).toBe(false);
  });
});
