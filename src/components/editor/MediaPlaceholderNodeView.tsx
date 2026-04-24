import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { FileImage, FileVideo, Link as LinkIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Button, Input } from "@zedi/ui";
import type { MediaPlaceholderMode } from "./extensions/MediaPlaceholderExtension";

/**
 * サーバーの `ALLOWED_UPLOAD_TYPES`（server/api/src/routes/media.ts）と一致させた
 * クライアント側の許可 MIME セット。ここが緩いとサーバーに弾かれて生の HTTP 415
 * 文字列がユーザーに見えてしまうため、二重定義してでも同期させる。
 *
 * Mirror of the server's `ALLOWED_UPLOAD_TYPES` so we surface the friendly
 * localized error before the request hits the server.
 */
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/apng",
  "image/bmp",
  "image/x-ms-bmp",
]);
const ALLOWED_VIDEO_MIME = new Set(["video/webm", "video/mp4"]);

const IMAGE_MIME_ACCEPT = [...ALLOWED_IMAGE_MIME].join(",");
const VIDEO_MIME_ACCEPT = [...ALLOWED_VIDEO_MIME].join(",");
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * VITE_API_BASE_URL で分離構成される本番環境でも `/api/media/*` が正しい API
 * オリジンへ飛ぶよう、ベース URL を解決する。フロントエンド = API のときは空文字で
 * フォールバックし、相対 URL のまま発行する。
 *
 * Resolves the API origin so split deployments with `VITE_API_BASE_URL`
 * route `/api/media/*` to the correct host.
 */
function resolveApiBaseUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  return base.replace(/\/$/, "");
}

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
  const normalized = mime.toLowerCase();
  if (mode === "image") return ALLOWED_IMAGE_MIME.has(normalized);
  return ALLOWED_VIDEO_MIME.has(normalized);
}

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "error"; message: string };

/**
 * レスポンスから人間向けエラーメッセージを抽出する。サーバーは
 * `{ ok: false, error: { message } }` または `{ message }` を返す。
 *
 * Extracts a human-readable message from an API error response; both the
 * envelope shape and the legacy `{ message }` shape are accepted.
 */
async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as {
      ok?: boolean;
      error?: { message?: string };
      message?: string;
    } | null;
    return data?.error?.message ?? data?.message ?? `${fallback} (HTTP ${response.status})`;
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

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
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

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
        const presign = await fetch(`${apiBaseUrl}/api/media/upload`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_name: file.name,
            content_type: file.type,
            file_size: file.size,
          }),
        });
        if (!presign.ok) {
          throw new Error(
            await extractErrorMessage(presign, t("editor.media.errors.uploadFailed")),
          );
        }
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
        if (!put.ok) {
          throw new Error(`${t("editor.media.errors.uploadFailed")} (HTTP ${put.status})`);
        }

        const confirm = await fetch(`${apiBaseUrl}/api/media/confirm`, {
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
        if (!confirm.ok) {
          throw new Error(
            await extractErrorMessage(confirm, t("editor.media.errors.uploadFailed")),
          );
        }

        const derivedAlt = altValue.trim() || deriveAltFromFileName(file.name);
        replaceWithMediaNode({
          src: `${apiBaseUrl}/api/media/${media_id}`,
          alt: derivedAlt,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("editor.media.errors.uploadFailed");
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
