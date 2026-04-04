/**
 * Dispatches workspace file preview UI (dialog host listens on `window`).
 * ワークスペースファイルプレビュー用イベント（ダイアログホストが `window` で購読）。
 */

/** CustomEvent name for file preview. / ファイルプレビュー用イベント名 */
export const FILE_PREVIEW_EVENT = "zedi:file-preview";

/** Payload for {@link FILE_PREVIEW_EVENT}. / {@link FILE_PREVIEW_EVENT} のペイロード */
export interface FilePreviewEventDetail {
  /** Relative path within the linked workspace. / リンク済みワークスペース内の相対パス */
  relativePath: string;
  /** Set when read failed. / 読み取り失敗時 */
  error?: string;
  /** True when no folder is linked for the note. / ノートにフォルダ未リンクのとき */
  noWorkspace?: boolean;
  /** UTF-8 content when read succeeded (may be pre-truncated). / 成功時の本文（事前省略可） */
  content?: string;
  /** True when `content` was truncated for display. / 表示用に省略したとき true */
  truncated?: boolean;
}

/**
 * Opens the file preview dialog by dispatching {@link FILE_PREVIEW_EVENT}.
 * {@link FILE_PREVIEW_EVENT} を発火してプレビューダイアログを開く。
 */
export function dispatchFilePreview(detail: FilePreviewEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FilePreviewEventDetail>(FILE_PREVIEW_EVENT, { detail }));
}
