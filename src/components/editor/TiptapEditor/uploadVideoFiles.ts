import type { Editor } from "@tiptap/core";
import { ALLOWED_VIDEO_MIME, MediaUploadError, uploadMediaFile } from "@/lib/media/uploadMediaFile";

/**
 * 動画アップロードの失敗をユーザー向け日本語メッセージへ変換する。トーストの
 * description に渡す前提。MIME / サイズ違反は具体的に、それ以外は汎用文言にする。
 *
 * Maps a video upload failure to a user-facing (Japanese) toast description.
 */
export function describeVideoUploadError(error: unknown): string {
  if (error instanceof MediaUploadError && error.code === "unsupportedType") {
    return "対応していない動画形式です";
  }
  if (error instanceof MediaUploadError && error.code === "tooLarge") {
    return "ファイルサイズが 50MB を超えています";
  }
  return "動画のアップロードに失敗しました";
}

/**
 * 動画ファイル群を WebM 変換なしで /api/media（S3 デフォルトストレージ）へ順次
 * アップロードし、成功するごとに `video` ノードを挿入する。D&D（useImageUploadManager）と
 * ペースト（usePasteImageHandler）の両経路で共有する。
 *
 * Sequentially uploads video files to the default S3 storage and inserts a
 * `video` node per success. Shared by the drag-drop and paste code paths.
 */
export async function uploadVideoFilesAndInsert(
  editor: Editor,
  files: File[],
  onError: (description: string) => void,
): Promise<void> {
  for (const file of files) {
    try {
      const { src } = await uploadMediaFile(file, { allowedMime: ALLOWED_VIDEO_MIME });
      const alt = file.name.replace(/\.[^./\\]+$/u, "");
      editor.chain().focus().setVideo({ src, alt }).run();
    } catch (error) {
      onError(describeVideoUploadError(error));
    }
  }
}
