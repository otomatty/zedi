import { useCallback, useMemo, useState } from "react";
import { getThumbnailApiBaseUrl } from "./thumbnailApiHelpers";

export function useThumbnailImageGenerate(
  trimmedTitle: string,
  isSignedIn: boolean,
  onSelectThumbnail: (imageUrl: string, alt: string, previewUrl?: string) => void,
) {
  const [isLoading, setIsLoading] = useState(false);
  const thumbnailApiBaseUrl = getThumbnailApiBaseUrl();

  const generateImage = useCallback(async () => {
    if (!trimmedTitle) return "タイトルを入力してください";

    setIsLoading(true);

    try {
      if (!isSignedIn) {
        return "ログインが必要です";
      }
      const response = await fetch(`${thumbnailApiBaseUrl}/api/thumbnail/image-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          prompt: trimmedTitle,
          aspectRatio: "16:9",
          imageSize: "2K",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `画像生成に失敗しました: ${response.status}`);
      }

      const data = (await response.json()) as {
        imageUrl: string;
        mimeType: string;
      };

      onSelectThumbnail(data.imageUrl, trimmedTitle, data.imageUrl);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "画像の生成に失敗しました";
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, thumbnailApiBaseUrl, trimmedTitle, onSelectThumbnail]);

  return useMemo(() => ({ generateImage, isGenerating: isLoading }), [generateImage, isLoading]);
}
