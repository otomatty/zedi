import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { transformUrl } from "../utils/urlTransform";

const IMAGE_URL_PATTERN = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|bmp|ico)(\?[^\s]*)?/i;
const DISALLOWED_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "::1", "[::1]", "localhost"]);

interface UsePasteImageHandlerParams {
  editor: Editor | null;
  handleImageUpload: (files: FileList | File[]) => void;
}

function isPrivateIpv4Host(hostname: string): boolean {
  const octets = hostname.split(".");
  if (octets.length !== 4 || octets.some((octet) => octet === "" || Number.isNaN(Number(octet)))) {
    return false;
  }

  const [first, second] = octets.map((octet) => Number(octet));
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6Host(hostname: string): boolean {
  if (!hostname.includes(":")) return false;
  const normalizedHost = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalizedHost === "::1" ||
    normalizedHost.startsWith("fe80:") ||
    normalizedHost.startsWith("fc") ||
    normalizedHost.startsWith("fd")
  );
}

function isEmbeddableImageUrl(url: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return false;
  }

  const normalizedHost = parsedUrl.hostname.toLowerCase();
  if (
    DISALLOWED_HOSTS.has(normalizedHost) ||
    normalizedHost.endsWith(".localhost") ||
    normalizedHost.endsWith(".local")
  ) {
    return false;
  }

  return !isPrivateIpv4Host(normalizedHost) && !isPrivateIpv6Host(normalizedHost);
}

/**
 * ペースト時に画像ファイルまたは画像 URL を検出して処理するフック。
 * Hook that detects and handles pasted image files or image URLs.
 *
 * @param params - エディタとアップロードハンドラ / Editor and upload handler
 */
export function usePasteImageHandler({ editor, handleImageUpload }: UsePasteImageHandlerParams) {
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      const text = event.clipboardData?.getData("text/plain");

      if (items) {
        const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));

        if (imageItems.length > 0) {
          event.preventDefault();
          const files = imageItems
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null);
          handleImageUpload(files);
          return;
        }
      }

      if (text) {
        const trimmedText = text.trim();

        // 外部サービス URL の変換を優先チェック
        // Check for external service URL transformations first
        if (isEmbeddableImageUrl(trimmedText)) {
          const result = transformUrl(trimmedText);

          if (result?.type === "gyazo-image") {
            event.preventDefault();
            editor
              .chain()
              .focus()
              .setImage({
                src: result.imageUrl,
                alt: "Gyazo image",
                title: result.originalUrl,
              })
              .run();
            return;
          }

          if (result?.type === "youtube-embed") {
            event.preventDefault();
            editor
              .chain()
              .focus()
              .insertYouTubeEmbed({
                videoId: result.videoId,
              })
              .run();
            return;
          }
        }

        // 通常の画像 URL パターン / Standard image URL pattern
        const matches = text.match(IMAGE_URL_PATTERN);

        if (matches && matches[0]) {
          const imageUrl = matches[0];
          if (!isEmbeddableImageUrl(imageUrl)) {
            return;
          }

          event.preventDefault();
          const alt = imageUrl.split("/").pop()?.split("?")[0] || "image";

          editor
            .chain()
            .focus()
            .setImage({
              src: imageUrl,
              alt,
              title: imageUrl,
            })
            .run();
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("paste", handlePaste);

    return () => {
      editorElement.removeEventListener("paste", handlePaste);
    };
  }, [editor, handleImageUpload]);
}
