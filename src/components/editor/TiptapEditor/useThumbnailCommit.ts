import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Editor } from "@tiptap/core";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@zedi/ui";
import { getStorageProvider, getSettingsForUpload, convertToWebP } from "@/lib/storage";
import type { StorageSettings } from "@/types/storage";
import { getThumbnailApiBaseUrl } from "./thumbnailApiHelpers";

interface UseThumbnailCommitOptions {
  editorRef: React.RefObject<Editor | null>;
  pageTitle: string;
  storageSettings: StorageSettings;
}

async function fetchImageAsFile(imageUrl: string, fallbackUrl?: string): Promise<File> {
  const tryFetch = async (url: string): Promise<File> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    const blob = await res.blob();
    const contentType = blob.type || "image/png";
    const ext = contentType.split("/")[1]?.split("+")[0] || "png";
    return new File([blob], `thumbnail-${Date.now()}.${ext}`, { type: contentType });
  };

  try {
    return await tryFetch(imageUrl);
  } catch (err) {
    if (fallbackUrl && fallbackUrl !== imageUrl) {
      return await tryFetch(fallbackUrl);
    }
    throw err;
  }
}

async function commitViaServerS3(
  imageUrl: string,
  altText: string,
  previewUrl: string | undefined,
  baseUrl: string,
): Promise<{ imageUrl: string; provider: string }> {
  const response = await fetch(`${baseUrl}/api/thumbnail/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      sourceUrl: imageUrl,
      fallbackUrl: previewUrl,
      title: altText,
    }),
  });

  if (response.status === 401) {
    const err = new Error("ログインが必要です") as Error & { redirectToSignIn?: boolean };
    err.redirectToSignIn = true;
    throw err;
  }
  if (!response.ok) {
    let message = `画像の保存に失敗しました: ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      if (data?.message) message = data.message;
      else if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { imageUrl?: string; provider?: string };
  if (!data.imageUrl) throw new Error("画像のURLが取得できませんでした");
  return { imageUrl: data.imageUrl, provider: data.provider ?? "s3" };
}

export function useThumbnailCommit({
  editorRef,
  pageTitle,
  storageSettings,
}: UseThumbnailCommitOptions) {
  const { isSignedIn, isLoaded } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const thumbnailApiBaseUrl = getThumbnailApiBaseUrl();

  const handleInsertThumbnailImage = useCallback(
    async (imageUrl: string, alt: string, previewUrl?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      if (!isLoaded) return;
      if (!isSignedIn) {
        toast({
          title: "ログインが必要です",
          description: "画像の保存にはログインしてください",
          variant: "destructive",
        });
        return;
      }

      const altText = alt || pageTitle || "thumbnail";
      const uploadSettings = getSettingsForUpload(storageSettings);
      const useS3 = uploadSettings.provider === "s3";

      try {
        let finalUrl: string;
        let providerId: string;

        if (useS3) {
          if (!thumbnailApiBaseUrl) {
            throw new Error("APIのURLが設定されていません");
          }
          const result = await commitViaServerS3(
            imageUrl,
            altText,
            previewUrl,
            thumbnailApiBaseUrl,
          );
          finalUrl = result.imageUrl;
          providerId = result.provider;
        } else {
          const file = await fetchImageAsFile(imageUrl, previewUrl);
          // JPEG/PNG のみ WebP に変換（GIF はそのまま。APNG は MIME が image/png のため現状は変換対象）
          const isStaticImage = file.type === "image/jpeg" || file.type === "image/png";
          const fileToUpload = isStaticImage ? await convertToWebP(file) : file;
          const provider = getStorageProvider(uploadSettings, {
            getToken: async () => null,
          });
          finalUrl = await provider.uploadImage(fileToUpload, {
            fileName: fileToUpload.name,
          });
          providerId = uploadSettings.provider;
        }

        editor
          .chain()
          .focus()
          .insertContentAt(0, {
            type: "image",
            attrs: {
              src: finalUrl,
              alt: altText,
              title: altText,
              storageProviderId: providerId,
            },
          })
          .run();
      } catch (error) {
        const err = error as Error & { redirectToSignIn?: boolean };
        if (err.redirectToSignIn) {
          toast({
            title: "ログインが必要です",
            description: "再度ログインしてください",
            variant: "destructive",
          });
          navigate("/sign-in", { replace: true });
          return;
        }
        const isFetchError =
          error instanceof TypeError ||
          (error instanceof Error &&
            /Failed to fetch|CORS|NetworkError|Image fetch failed/i.test(error.message));
        toast({
          title: "画像の保存に失敗しました",
          description: isFetchError
            ? "画像の取得に失敗しました。ネットワーク環境をご確認ください。"
            : "しばらくしてからもう一度お試しください。",
          variant: "destructive",
        });
      }
    },
    [
      editorRef,
      isSignedIn,
      isLoaded,
      thumbnailApiBaseUrl,
      pageTitle,
      toast,
      storageSettings,
      navigate,
    ],
  );

  return { handleInsertThumbnailImage };
}
