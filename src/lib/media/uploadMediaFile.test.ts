import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  MAX_UPLOAD_SIZE_BYTES,
  MediaUploadError,
  uploadMediaFile,
} from "./uploadMediaFile";

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeFile(name: string, type: string, size = 1): File {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
}

/**
 * サーバ `server/api/src/routes/media.ts` の `new Set([...])` リテラルから MIME 値を
 * 抽出する。ワークスペース外のサーバ定数を import できないため、ファイルを読んで照合する。
 * Extract MIME values from a `new Set([...])` literal in the server file; the
 * server constant cannot be imported (it lives outside the workspace).
 */
function extractServerMimeSet(source: string, constName: string): Set<string> {
  const match = source.match(new RegExp(`${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!match) throw new Error(`${constName} not found in server media.ts`);
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
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

  // クライアントの許可 MIME がサーバ `ALLOWED_UPLOAD_TYPES` とドリフトすると、ユーザーに
  // ローカライズ前の生 HTTP 415 が見えてしまう。AGENTS.md のドリフト検知方針に従い、
  // サーバファイルを読んで文字列一致を CI で担保する（cf. tagCharacterClassSync.test.ts）。
  // If the client allowlist drifts from the server's ALLOWED_UPLOAD_TYPES, users
  // see a raw HTTP 415 instead of a localized error. Per AGENTS.md, read the
  // server file and assert equality in CI (cf. tagCharacterClassSync.test.ts).
  it("keeps the allowed MIME sets in sync with the server contract", () => {
    const serverFilePath = resolve(__dirname, "../../../server/api/src/routes/media.ts");
    const source = readFileSync(serverFilePath, "utf8");
    const serverImages = extractServerMimeSet(source, "SAFE_INLINE_IMAGE_TYPES");
    const serverVideos = extractServerMimeSet(source, "SAFE_INLINE_VIDEO_TYPES");

    expect([...ALLOWED_IMAGE_MIME].sort()).toEqual([...serverImages].sort());
    expect([...ALLOWED_VIDEO_MIME].sort()).toEqual([...serverVideos].sort());
  });
});
