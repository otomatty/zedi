import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Editor } from "@tiptap/core";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@zedi/ui";
import { getStorageProvider, getSettingsForUpload, convertToWebP } from "@/lib/storage";
import type { StorageSettings } from "@/types/storage";
import { commitThumbnailFromUrl, AuthRedirectError } from "@/lib/thumbnailCommit";
import { getThumbnailApiBaseUrl } from "./thumbnailApiHelpers";

function isAuthRedirectError(err: unknown): err is AuthRedirectError {
  return err instanceof AuthRedirectError;
}

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
          const result = await commitThumbnailFromUrl(imageUrl, {
            baseUrl: thumbnailApiBaseUrl,
            fallbackUrl: previewUrl,
            title: altText,
          });
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
        if (isAuthRedirectError(error)) {
          toast({
            title: "ログインが必要です",
            description: "再度ログインしてください",
            variant: "destructive",
          });
          navigate("/sign-in", { replace: true });
          return;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        const isFetchError =
          err instanceof TypeError || /Failed to fetch|CORS|NetworkError/i.test(err.message);
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
