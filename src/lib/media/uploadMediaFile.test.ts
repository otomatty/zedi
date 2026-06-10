import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  MAX_UPLOAD_SIZE_BYTES,
  MediaUploadError,
  uploadMediaFile,
} from "./uploadMediaFile";

function makeFile(name: string, type: string, size = 1): File {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
}

describe("uploadMediaFile validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws unsupportedType for a MIME outside the allowed set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const file = makeFile("note.txt", "text/plain");
    await expect(uploadMediaFile(file)).rejects.toMatchObject({
      name: "MediaUploadError",
      code: "unsupportedType",
    });
    // バリデーションで弾けばネットワークには出ない / never reaches the network
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("respects a narrowed allowedMime set (video-only rejects images)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const image = makeFile("photo.png", "image/png");
    await expect(
      uploadMediaFile(image, { allowedMime: ALLOWED_VIDEO_MIME }),
    ).rejects.toBeInstanceOf(MediaUploadError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws tooLarge when the file exceeds the size limit", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const file = makeFile("clip.webm", "video/webm", MAX_UPLOAD_SIZE_BYTES + 1);
    await expect(uploadMediaFile(file)).rejects.toMatchObject({ code: "tooLarge" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the allowed MIME sets in sync with the server contract", () => {
    expect(ALLOWED_VIDEO_MIME.has("video/webm")).toBe(true);
    expect(ALLOWED_VIDEO_MIME.has("video/mp4")).toBe(true);
    expect(ALLOWED_IMAGE_MIME.has("image/png")).toBe(true);
  });
});
