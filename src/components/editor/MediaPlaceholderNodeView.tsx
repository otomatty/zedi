import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { FileImage, FileVideo, Link as LinkIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Button, Input } from "@zedi/ui";
import type { MediaPlaceholderMode } from "./extensions/MediaPlaceholderExtension";
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  MediaUploadError,
  resolveApiBaseUrl,
  uploadMediaFile,
} from "@/lib/media/uploadMediaFile";

const IMAGE_MIME_ACCEPT = [...ALLOWED_IMAGE_MIME].join(",");
const VIDEO_MIME_ACCEPT = [...ALLOWED_VIDEO_MIME].join(",");

/**
 * ファイル名から代替テキストを自動生成する（拡張子を外し、記号を空白に変換して
 * trim する）。`shot_2024_01-01.png` → `shot 2024 01 01`。
 *
 * Derives a plain-text alt from a file name (strip extension, replace
 * underscores/hyphens/dots with spaces, trim).
 */
function deriveAltFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/u, "");
  return base
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `node.attrs.mode` の実行時値を安全に正規化する。想定外の値が入ってきた場合は
 * デフォルトで `"image"` に寄せる（UI は画像フローのまま、サーバー側の
 * 許可 MIME もそれに対応）。
 *
 * Runtime normalization of `node.attrs.mode`. Unknown values coerce to
 * `"image"` so the UI, MIME guard, and resulting node type stay aligned.
 */
function normalizeMode(raw: unknown): MediaPlaceholderMode {
  return raw === "video" ? "video" : "image";
}

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "error"; message: string };

/**
 * MediaPlaceholder の NodeView。File 選択 / URL 入力 / ドラッグ＆ドロップを
 * 1 つのカードで提供し、確定すると対応する `image` または `video` ノードに
 * 自身を置き換える。
 *
 * Unified NodeView for the media placeholder: exposes file picker, URL
 * input, and a drop zone in one card; on completion replaces itself with
 * either an `image` or `video` node.
 */
export function MediaPlaceholderNodeView({ node, editor, getPos, deleteNode }: NodeViewProps) {
  const { t } = useTranslation();
  const mode = normalizeMode(node.attrs.mode);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // アップロード中に削除されたかを追跡する。awaits の後にこの ref を見て、
  // 削除済みなら replaceWithMediaNode を呼ばず早期リターンする。
  // Tracks whether the placeholder was removed mid-upload; each await step
  // checks this before proceeding so we never replace a node that no longer
  // exists.
  const removedRef = useRef(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [altValue, setAltValue] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" });
  const [isDragActive, setIsDragActive] = useState(false);

  const targetNodeType = mode === "video" ? "video" : "image";
  const acceptAttr = mode === "video" ? VIDEO_MIME_ACCEPT : IMAGE_MIME_ACCEPT;
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

  /**
   * 削除ボタンのハンドラ。先にフラグを立ててから deleteNode() を呼び、
   * 進行中の handleFileUpload が復帰後に置換処理を続行しないようにする。
   *
   * Delete handler: set the flag before calling deleteNode() so any
   * in-flight upload exits its async chain without replacing the node.
   */
  const handleRemoveClick = useCallback(() => {
    removedRef.current = true;
    deleteNode();
  }, [deleteNode]);

  /**
   * プレースホルダーを指定属性の最終ノードで置き換える。
   * Replace this placeholder with the final media node.
   */
  const replaceWithMediaNode = useCallback(
    (attrs: { src: string; alt: string; poster?: string | null }) => {
      const pos = getPos();
      if (pos === undefined) return;
      const { view, state } = editor;
      const schema = state.schema;
      const type = schema.nodes[targetNodeType];
      if (!type) return;
      const nodeSize = node.nodeSize;
      const tr = state.tr.replaceWith(pos, pos + nodeSize, type.create(attrs));
      view.dispatch(tr);
    },
    [editor, getPos, node.nodeSize, targetNodeType],
  );

  /**
   * /api/media/upload → PUT → /api/media/confirm の 2 段アップロードを行い、
   * 完了したら自分を最終ノードに置き換える。confirm が失敗した場合は壊れた
   * メディアノードを残さず、エラー表示に留める。
   *
   * Presigned upload flow: POST /api/media/upload → PUT to S3 → POST
   * /api/media/confirm → replace placeholder with the final media node.
   * A failed confirm aborts before any replacement so the user does not end
   * up with a broken media node pointing at a non-existent DB row.
   */
  const handleFileUpload = useCallback(
    async (file: File) => {
      setUploadState({ kind: "uploading", progress: 0 });
      try {
        const allowedMime = mode === "video" ? ALLOWED_VIDEO_MIME : ALLOWED_IMAGE_MIME;
        const { src } = await uploadMediaFile(file, { apiBaseUrl, allowedMime });
        // アップロード中に placeholder が削除されていたら、メディアは DB に残るが
        // ノードは挿入しない（ユーザーの削除意思を優先する）。DB 側のゴミは
        // 個別のクリーンアップジョブで回収可能。
        // If the placeholder was deleted mid-upload, skip the node replacement —
        // the user asked to remove it. The confirmed media row becomes a
        // sweepable orphan that later GC can reclaim.
        if (removedRef.current) return;

        const derivedAlt = altValue.trim() || deriveAltFromFileName(file.name);
        replaceWithMediaNode({ src, alt: derivedAlt });
      } catch (error) {
        if (removedRef.current) return;
        const message =
          error instanceof MediaUploadError
            ? error.message || t(`editor.media.errors.${error.code}`)
            : error instanceof Error
              ? error.message
              : t("editor.media.errors.uploadFailed");
        setUploadState({ kind: "error", message });
      }
    },
    [altValue, apiBaseUrl, mode, replaceWithMediaNode, t],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void handleFileUpload(file);
    },
    [handleFileUpload],
  );

  const handleUrlSubmit = useCallback(() => {
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    // `javascript:` などのスキームを排除するため、相対 URL もベース付きで new URL を通す。
    // Route everything — including relative URLs — through `new URL` so we
    // explicitly reject schemes like `javascript:` that start with "ja".
    let parsed: URL;
    try {
      parsed = new URL(trimmed, window.location.origin);
    } catch {
      setUploadState({ kind: "error", message: t("editor.media.errors.invalidUrl") });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setUploadState({ kind: "error", message: t("editor.media.errors.invalidUrl") });
      return;
    }
    const fallbackAlt = altValue.trim() || deriveAltFromFileName(trimmed.split("/").pop() ?? "");
    replaceWithMediaNode({ src: trimmed, alt: fallbackAlt });
  }, [altValue, replaceWithMediaNode, t, urlValue]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void handleFileUpload(file);
    },
    [handleFileUpload],
  );

  return (
    <NodeViewWrapper>
      <div
        className={`bg-card my-4 rounded-md border-2 border-dashed p-4 transition-colors ${
          isDragActive ? "border-primary bg-accent" : "border-muted-foreground/30"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {mode === "video" ? (
              <FileVideo className="text-muted-foreground h-5 w-5" aria-hidden />
            ) : (
              <FileImage className="text-muted-foreground h-5 w-5" aria-hidden />
            )}
            <span className="text-sm font-medium">
              {t(mode === "video" ? "editor.media.video.title" : "editor.media.image.title")}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("editor.media.actions.remove")}
            onClick={handleRemoveClick}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {uploadState.kind === "uploading" ? (
          <div className="text-muted-foreground mt-4 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("editor.media.status.uploading")}
          </div>
        ) : urlMode ? (
          <div className="mt-3 space-y-2">
            <Input
              type="url"
              value={urlValue}
              placeholder={t("editor.media.placeholders.url")}
              onChange={(e) => setUrlValue(e.target.value)}
            />
            <Input
              type="text"
              value={altValue}
              placeholder={t("editor.media.placeholders.alt")}
              onChange={(e) => setAltValue(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleUrlSubmit}
                disabled={!urlValue.trim()}
                className="flex-1"
              >
                {t("editor.media.actions.insert")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setUrlMode(false)}>
                {t("editor.media.actions.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1"
            >
              <Upload className="h-4 w-4" />
              {t("editor.media.actions.pickFile")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setUrlMode(true)}
              className="flex items-center gap-1"
            >
              <LinkIcon className="h-4 w-4" />
              {t("editor.media.actions.enterUrl")}
            </Button>
          </div>
        )}

        {uploadState.kind === "error" && (
          <p className="text-destructive mt-2 text-xs" role="alert">
            {uploadState.message}
          </p>
        )}

        <p className="text-muted-foreground mt-3 text-xs">{t("editor.media.dropzone.hint")}</p>

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptAttr}
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>
    </NodeViewWrapper>
  );
}
