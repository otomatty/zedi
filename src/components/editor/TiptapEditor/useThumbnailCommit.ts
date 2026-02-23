import { useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const getThumbnailApiBaseUrl = () => (import.meta.env.VITE_ZEDI_API_BASE_URL as string) ?? "";

interface UseThumbnailCommitOptions {
  editorRef: React.RefObject<Editor | null>;
  pageTitle: string;
}

export function useThumbnailCommit({ editorRef, pageTitle }: UseThumbnailCommitOptions) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const thumbnailApiBaseUrl = getThumbnailApiBaseUrl();

  const handleInsertThumbnailImage = useCallback(
    async (imageUrl: string, alt: string, previewUrl?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const token = await getToken();
      if (!token) {
        toast({
          title: "ログインが必要です",
          description: "画像の保存にはログインしてください",
          variant: "destructive",
        });
        return;
      }
      if (!thumbnailApiBaseUrl) {
        toast({
          title: "設定エラー",
          description: "APIのURLが設定されていません",
          variant: "destructive",
        });
        return;
      }

      const altText = alt || pageTitle || "thumbnail";

      try {
        const response = await fetch(`${thumbnailApiBaseUrl}/api/thumbnail/commit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sourceUrl: imageUrl,
            fallbackUrl: previewUrl,
            title: altText,
          }),
        });

        if (!response.ok) {
          let message = `画像の保存に失敗しました: ${response.status}`;
          try {
            const data = (await response.json()) as { error?: string };
            if (data?.error) message = data.error;
          } catch {
            // ignore parse errors
          }
          throw new Error(message);
        }

        const data = (await response.json()) as { imageUrl?: string; provider?: string };
        if (!data.imageUrl) throw new Error("画像のURLが取得できませんでした");

        editor
          .chain()
          .focus()
          .insertContentAt(0, {
            type: "image",
            attrs: {
              src: data.imageUrl,
              alt: altText,
              title: altText,
              storageProviderId: "s3",
            },
          })
          .run();
      } catch (error) {
        toast({
          title: "画像の保存に失敗しました",
          description: error instanceof Error ? error.message : "画像の保存に失敗しました",
          variant: "destructive",
        });
      }
    },
    [editorRef, getToken, thumbnailApiBaseUrl, pageTitle, toast],
  );

  return { handleInsertThumbnailImage };
}
