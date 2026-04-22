/**
 * FAB のメニュー選択・URL作成・画像作成完了時のハンドラを集約する hook。
 * Aggregates handlers for FAB menu selection, web clip create, and image create.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCreatePage } from "@/hooks/usePageQueries";
import { useAddPageToNote } from "@/hooks/useNoteQueries";
import { useToast } from "@zedi/ui";
import type { FABMenuOption } from "./FABMenu";

/** FAB の作成・クリップ・画像ダイアログ制御用オプション。Options for FAB create/clip/image dialog handlers. */
export interface UseFloatingActionButtonHandlersOptions {
  createNewPage: () => Promise<void>;
  setIsWebClipperOpen: (open: boolean) => void;
  setIsImageDialogOpen: (open: boolean) => void;
  /**
   * 指定したノート配下でページを作成する場合のノート ID。
   * When set, newly created pages are linked to this note and routed to
   * `/notes/:noteId/:pageId` instead of the standalone `/pages/:id`.
   */
  noteId?: string;
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
  const { createNewPage, setIsWebClipperOpen, setIsImageDialogOpen, noteId } = options;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const addPageToNoteMutation = useAddPageToNote();
  const { toast } = useToast();

  /**
   * 作成済みページをノートに紐づけ、ノート配下のパスに遷移する。
   * Link the created page to the current note (if any) and navigate into it.
   */
  const linkAndNavigate = useCallback(
    async (pageId: string, navState?: Record<string, unknown>): Promise<void> => {
      if (noteId) {
        try {
          await addPageToNoteMutation.mutateAsync({ noteId, pageId });
        } catch (error) {
          // 紐づけ失敗時はスタンドアロンページとして遷移させ、ユーザー操作を止めない。
          // If linking fails, fall back to the standalone page so the user
          // can still see and edit their newly created page.
          console.error("Failed to attach page to note:", error);
          navigate(`/pages/${pageId}`, navState ? { state: navState } : undefined);
          return;
        }
        navigate(`/notes/${noteId}/${pageId}`, navState ? { state: navState } : undefined);
        return;
      }
      navigate(`/pages/${pageId}`, navState ? { state: navState } : undefined);
    },
    [addPageToNoteMutation, navigate, noteId],
  );

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
        await linkAndNavigate(newPage.id, { initialContent: content });
      } catch (error) {
        console.error("Failed to create page from URL:", error);
        toast({
          title: t("common.createPageFailed"),
          variant: "destructive",
        });
      }
    },
    [createPageMutation, linkAndNavigate, toast, t],
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
        await linkAndNavigate(newPage.id);
      } catch (error) {
        console.error("Failed to create page from image:", error);
        toast({
          title: t("common.createPageFailed"),
          variant: "destructive",
        });
      }
    },
    [createPageMutation, linkAndNavigate, toast, t],
  );

  return {
    handleMenuSelect,
    handleWebClipped,
    handleImageCreated,
  };
}
