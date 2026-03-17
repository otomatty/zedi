/**
 * FAB のメニュー選択・URL作成・画像作成完了時のハンドラを集約する hook。
 * Aggregates handlers for FAB menu selection, web clip create, and image create.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCreatePage } from "@/hooks/usePageQueries";
import { useToast } from "@zedi/ui";
import type { FABMenuOption } from "./FABMenu";

/** FAB の作成・クリップ・画像ダイアログ制御用オプション。Options for FAB create/clip/image dialog handlers. */
export interface UseFloatingActionButtonHandlersOptions {
  createNewPage: () => Promise<void>;
  setIsWebClipperOpen: (open: boolean) => void;
  setIsImageDialogOpen: (open: boolean) => void;
}

/** FAB ハンドラ hook の戻り値。Return type of useFloatingActionButtonHandlers. */
export interface UseFloatingActionButtonHandlersResult {
  handleMenuSelect: (option: FABMenuOption) => Promise<void>;
  handleWebClipped: (
    title: string,
    content: string,
    sourceUrl: string,
    thumbnailUrl?: string | null,
  ) => Promise<void>;
  handleImageCreated: (
    imageUrl: string,
    extractedText?: string,
    description?: string,
  ) => Promise<void>;
}

/**
 * FAB のオプション選択・クリップ完了・画像作成完了の処理を行う。
 * Handles FAB option selection, web clip completion, and image create completion.
 */
export function useFloatingActionButtonHandlers(
  options: UseFloatingActionButtonHandlersOptions,
): UseFloatingActionButtonHandlersResult {
  const { createNewPage, setIsWebClipperOpen, setIsImageDialogOpen } = options;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const { toast } = useToast();

  const handleMenuSelect = useCallback(
    async (option: FABMenuOption) => {
      switch (option) {
        case "blank":
          await createNewPage();
          break;
        case "url":
          setIsWebClipperOpen(true);
          break;
        case "image":
          setIsImageDialogOpen(true);
          break;
        case "template":
          toast({
            title: t("common.comingSoon"),
            description: t("common.templateComingSoon"),
          });
          break;
        case "voice":
          toast({
            title: t("common.comingSoon"),
            description: t("common.voiceComingSoon"),
          });
          break;
      }
    },
    [createNewPage, setIsWebClipperOpen, setIsImageDialogOpen, toast, t],
  );

  const handleWebClipped = useCallback(
    async (title: string, content: string, sourceUrl: string, thumbnailUrl?: string | null) => {
      try {
        const newPage = await createPageMutation.mutateAsync({
          title,
          content,
          sourceUrl,
          thumbnailUrl,
        });
        navigate(`/page/${newPage.id}`, {
          state: { initialContent: content },
        });
      } catch (error) {
        console.error("Failed to create page from URL:", error);
        toast({
          title: t("common.createPageFailed"),
          variant: "destructive",
        });
      }
    },
    [createPageMutation, navigate, toast, t],
  );

  const handleImageCreated = useCallback(
    async (imageUrl: string, extractedText?: string, description?: string) => {
      try {
        const imageBlock = {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: {
                src: imageUrl,
                alt: description || t("editor.uploadedImageAlt"),
              },
            },
            {
              type: "paragraph",
              content: extractedText ? [{ type: "text", text: extractedText }] : [],
            },
          ],
        };
        const content = JSON.stringify(imageBlock);
        const newPage = await createPageMutation.mutateAsync({
          title: "",
          content,
        });
        navigate(`/page/${newPage.id}`);
      } catch (error) {
        console.error("Failed to create page from image:", error);
        toast({
          title: t("common.createPageFailed"),
          variant: "destructive",
        });
      }
    },
    [createPageMutation, navigate, toast, t],
  );

  return {
    handleMenuSelect,
    handleWebClipped,
    handleImageCreated,
  };
}
