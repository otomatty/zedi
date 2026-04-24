import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { FileImage, FileVideo, Link as LinkIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Button, Input } from "@zedi/ui";
import { ApiError } from "@/lib/api/apiClient";
import type { MediaPlaceholderMode } from "./extensions/MediaPlaceholderExtension";

const IMAGE_MIME_ACCEPT = "image/*";
const VIDEO_MIME_ACCEPT = "video/webm,video/mp4";
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

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
 * 動画/画像の MIME がモードに合っているかを判定する。
 * Validates that a file's MIME type matches the placeholder mode.
 */
function isMimeAllowedForMode(mime: string, mode: MediaPlaceholderMode): boolean {
  if (mode === "image") return mime.startsWith("image/");
  return mime === "video/webm" || mime === "video/mp4";
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
  const mode = (node.attrs.mode ?? "image") as MediaPlaceholderMode;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlMode, setUrlMode] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [altValue, setAltValue] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" });
  const [isDragActive, setIsDragActive] = useState(false);

  const targetNodeType = mode === "video" ? "video" : "image";
  const acceptAttr = mode === "video" ? VIDEO_MIME_ACCEPT : IMAGE_MIME_ACCEPT;

  /**
   * プレースホルダーを指定属性の最終ノードで置き換える。
   * Replace this placeholder with the final media node.
   */
  const replaceWithMediaNode = useCallback(
    (attrs: { src: string; alt: string; poster?: string | null }) => {
      const pos = getPos();
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
   * 完了したら自分を最終ノードに置き換える。
   *
   * Presigned upload flow: POST /api/media/upload → PUT to S3 → POST
   * /api/media/confirm → replace placeholder with the final media node.
   */
  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!isMimeAllowedForMode(file.type, mode)) {
        setUploadState({
          kind: "error",
          message: t("editor.media.errors.unsupportedType"),
        });
        return;
      }
      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        setUploadState({
          kind: "error",
          message: t("editor.media.errors.tooLarge"),
        });
        return;
      }

      setUploadState({ kind: "uploading", progress: 0 });
      try {
        const presign = await fetch("/api/media/upload", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_name: file.name,
            content_type: file.type,
            file_size: file.size,
          }),
        });
        if (!presign.ok) throw new Error(`presign failed: HTTP ${presign.status}`);
        const { upload_url, media_id, s3_key } = (await presign.json()) as {
          upload_url: string;
          media_id: string;
          s3_key: string;
        };

        const put = await fetch(upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!put.ok) throw new Error(`upload failed: HTTP ${put.status}`);

        await fetch("/api/media/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_id,
            s3_key,
            file_name: file.name,
            content_type: file.type,
            file_size: file.size,
          }),
        });

        const derivedAlt = altValue.trim() || deriveAltFromFileName(file.name);
        replaceWithMediaNode({
          src: `/api/media/${media_id}`,
          alt: derivedAlt,
        });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : t("editor.media.errors.uploadFailed");
        setUploadState({ kind: "error", message });
      }
    },
    [altValue, mode, replaceWithMediaNode, t],
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
    try {
      // 相対 URL（/api/media/...）も受け入れるため、プロトコル無しは new URL を通さない。
      // Accept relative URLs (e.g. /api/media/...) by parsing against a safe base.
      const parsed = trimmed.startsWith("http") ? new URL(trimmed) : null;
      if (parsed && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setUploadState({ kind: "error", message: t("editor.media.errors.invalidUrl") });
        return;
      }
    } catch {
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
            onClick={() => deleteNode()}
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
