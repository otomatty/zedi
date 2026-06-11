import { describe, it, expect } from "vitest";
import { describeVideoUploadError } from "./uploadVideoFiles";
import { MediaUploadError } from "@/lib/media/uploadMediaFile";

describe("describeVideoUploadError", () => {
  it("maps unsupportedType to a format message", () => {
    expect(describeVideoUploadError(new MediaUploadError("unsupportedType"))).toBe(
      "対応していない動画形式です",
    );
  });

  it("maps tooLarge to a size message", () => {
    expect(describeVideoUploadError(new MediaUploadError("tooLarge"))).toBe(
      "ファイルサイズが 50MB を超えています",
    );
  });

  it("falls back to a generic message for uploadFailed and unknown errors", () => {
    expect(describeVideoUploadError(new MediaUploadError("uploadFailed"))).toBe(
      "動画のアップロードに失敗しました",
    );
    expect(describeVideoUploadError(new Error("boom"))).toBe("動画のアップロードに失敗しました");
  });
});
