import { describe, it, expect, vi, afterEach } from "vitest";
import { convertToWebP } from "./convertToWebP";

// 1x1 透明 PNG（S3Provider と同じ）
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function createPngFile(): File {
  const binary = atob(PNG_BASE64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new File([array], "test.png", { type: "image/png" });
}

describe("convertToWebP", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns non-image file as-is", async () => {
    const file = new File(["hello"], "doc.txt", { type: "text/plain" });
    const result = await convertToWebP(file);
    expect(result).toBe(file);
    expect(result.name).toBe("doc.txt");
    expect(result.type).toBe("text/plain");
  });

  it("returns WebP file as-is", async () => {
    const file = new File(["webpdata"], "image.webp", { type: "image/webp" });
    const result = await convertToWebP(file);
    expect(result).toBe(file);
    expect(result.name).toBe("image.webp");
    expect(result.type).toBe("image/webp");
  });

  it("converts PNG to WebP when canvas.toBlob supports webp", async () => {
    const pngFile = createPngFile();
    const mockBlob = new Blob(["webp"], { type: "image/webp" });

    // jsdom の Image は blob URL を読み込まないため、onload を即時発火させる
    const OriginalImage = globalThis.Image;
    vi.stubGlobal(
      "Image",
      class MockImage extends OriginalImage {
        constructor() {
          super();
          queueMicrotask(() => {
            Object.defineProperty(this, "naturalWidth", { value: 1 });
            Object.defineProperty(this, "naturalHeight", { value: 1 });
            this.onload?.();
          });
        }
      },
    );

    // jsdom の getContext は未実装のためモック
    const mockDrawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: mockDrawImage,
    } as unknown as CanvasRenderingContext2D);

    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");
    toBlobSpy.mockImplementation((callback) => {
      callback?.(mockBlob);
    });

    const result = await convertToWebP(pngFile);

    expect(result).not.toBe(pngFile);
    expect(result.name).toBe("test.webp");
    expect(result.type).toBe("image/webp");
    expect(result.size).toBe(mockBlob.size);
  });

  it("returns original file when canvas.toBlob returns null (webp unsupported)", async () => {
    const pngFile = createPngFile();

    const OriginalImage = globalThis.Image;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      "Image",
      class MockImage extends OriginalImage {
        constructor() {
          super();
          queueMicrotask(() => {
            Object.defineProperty(this, "naturalWidth", { value: 1 });
            Object.defineProperty(this, "naturalHeight", { value: 1 });
            this.onload?.();
          });
        }
      },
    );

    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");
    toBlobSpy.mockImplementation((callback) => {
      callback?.(null);
    });

    const result = await convertToWebP(pngFile);

    expect(result).toBe(pngFile);
    expect(result.name).toBe("test.png");
    expect(result.type).toBe("image/png");
  });

  it("returns original file when toBlob falls back to PNG", async () => {
    const pngFile = createPngFile();
    const fallbackBlob = new Blob(["png"], { type: "image/png" });

    const OriginalImage = globalThis.Image;
    vi.stubGlobal(
      "Image",
      class MockImage extends OriginalImage {
        constructor() {
          super();
          queueMicrotask(() => {
            Object.defineProperty(this, "naturalWidth", { value: 1 });
            Object.defineProperty(this, "naturalHeight", { value: 1 });
            this.onload?.();
          });
        }
      },
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback?.(fallbackBlob);
    });

    const result = await convertToWebP(pngFile);

    expect(result).toBe(pngFile);
    expect(result.name).toBe("test.png");
    expect(result.type).toBe("image/png");
  });

  it("preserves base filename when converting", async () => {
    const pngFile = new File([createPngFile()], "my-photo-2024.png", {
      type: "image/png",
    });
    const mockBlob = new Blob(["webp"], { type: "image/webp" });

    const OriginalImage = globalThis.Image;
    vi.stubGlobal(
      "Image",
      class MockImage extends OriginalImage {
        constructor() {
          super();
          queueMicrotask(() => {
            Object.defineProperty(this, "naturalWidth", { value: 1 });
            Object.defineProperty(this, "naturalHeight", { value: 1 });
            this.onload?.();
          });
        }
      },
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback?.(mockBlob);
    });

    const result = await convertToWebP(pngFile);

    expect(result.name).toBe("my-photo-2024.webp");
  });
});
