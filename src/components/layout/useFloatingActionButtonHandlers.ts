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
import { deleteCommittedThumbnail } from "@/lib/thumbnailCommit";
import { getThumbnailApiBaseUrl } from "@/components/editor/TiptapEditor/thumbnailApiHelpers";
import type { Page } from "@/types/page";
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
  /**
   * 既存ページをノートへ追加するアクション。FAB に「既存のページを追加」
   * メニュー項目が表示されている場合に呼び出される。
   *
   * Action to attach an existing page to the current note. Invoked when the
   * user selects the "Add existing page" entry from the FAB menu.
   */
  onAddExistingPage?: () => void;
}

/** FAB ハンドラ hook の戻り値。Return type of useFloatingActionButtonHandlers. */
export interface UseFloatingActionButtonHandlersResult {
  handleMenuSelect: (option: FABMenuOption) => Promise<void>;
  handleWebClipped: (
    title: string,
    content: string,
    sourceUrl: string,
    thumbnailUrl?: string | null,
    /** Persisted thumbnail object id from /api/thumbnail/commit (used for GC). */
    /** /api/thumbnail/commit が返すサムネイル ID（削除時 GC に使う）。 */
    thumbnailObjectId?: string | null,
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
  const { createNewPage, setIsWebClipperOpen, setIsImageDialogOpen, noteId, onAddExistingPage } =
    options;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const addPageToNoteMutation = useAddPageToNote();
  const { toast } = useToast();

  /**
   * 作成済みページをノートに紐づけ、ノート配下のパスに遷移する。
   * Issue #889 Phase 3 で `/pages/:id` を廃止。`noteId` プロップが渡されている
   * 場合は明示再紐づけ（ノートビューの FAB 経路）→`/notes/:noteId/:pageId`、
   * 未指定時はサーバが返す `newPage.noteId`（呼び出し元のデフォルトノート）
   * 配下へ遷移する。紐づけに失敗してもページ自体は作成済みなので、デフォルト
   * ノート配下にフォールバック遷移し、ユーザーが孤立ページに辿り着けるよう
   * にする（toast には「指定ノートへの追加に失敗」と明示）。
   *
   * Link the freshly-created page to the current note (if any) and navigate
   * to it. After Issue #889 Phase 3 retired `/pages/:id`, callers always land
   * on `/notes/:noteId/:pageId`: either the explicit `noteId` prop (after a
   * successful re-link) or the page's own `noteId` (the caller's default
   * note). On re-link failure the page itself was still created, so we fall
   * back to the default-note URL and surface a toast that calls out the
   * actual failure (attaching to the requested note) instead of stranding
   * the user.
   */
  const linkAndNavigate = useCallback(
    async (newPage: Page, navState?: Record<string, unknown>): Promise<void> => {
      if (noteId && noteId !== newPage.noteId) {
        try {
          await addPageToNoteMutation.mutateAsync({ noteId, pageId: newPage.id });
        } catch (error) {
          console.error("Failed to attach page to note:", error);
          toast({
            title: t("common.attachPageToNoteFailed"),
            variant: "destructive",
          });
          navigate(
            `/notes/${newPage.noteId}/${newPage.id}`,
            navState ? { state: navState } : undefined,
          );
          return;
        }
        navigate(`/notes/${noteId}/${newPage.id}`, navState ? { state: navState } : undefined);
        return;
      }
      navigate(
        `/notes/${newPage.noteId}/${newPage.id}`,
        navState ? { state: navState } : undefined,
      );
    },
    [addPageToNoteMutation, navigate, noteId, toast, t],
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
        case "addExisting":
          onAddExistingPage?.();
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
    [createNewPage, setIsWebClipperOpen, setIsImageDialogOpen, onAddExistingPage, toast, t],
  );

  const handleWebClipped = useCallback(
    async (
      title: string,
      content: string,
      sourceUrl: string,
      thumbnailUrl?: string | null,
      thumbnailObjectId?: string | null,
    ) => {
      let newPage: Awaited<ReturnType<typeof createPageMutation.mutateAsync>>;
      try {
        newPage = await createPageMutation.mutateAsync({
          title,
          content,
          sourceUrl,
          thumbnailUrl,
          thumbnailObjectId,
        });
      } catch (error) {
        // ページ作成が失敗すると、直前にコミット済みのサムネイルを参照する行が
        // どこにも残らず、永久にユーザーのストレージ枠を圧迫する。ベストエフォート
        // で `DELETE /api/thumbnail/serve/:id` を叩いてオーファンを回収してから、
        // 呼び出し元（submit hook）に失敗を伝播させる。submit hook 側はダイアログを
        // 開いたままにしてリトライを許可する。
        //
        // If page creation fails after a thumbnail commit, the committed
        // thumbnail row would otherwise be unreferenced and silently keep
        // counting against the user's storage quota forever. Best-effort
        // delete to roll it back, then rethrow so the submit hook can keep
        // the dialog open and let the user retry.
        if (thumbnailObjectId) {
          const baseUrl = getThumbnailApiBaseUrl();
          if (baseUrl) {
            await deleteCommittedThumbnail(thumbnailObjectId, { baseUrl });
          }
        }
        console.error("Failed to create page from URL:", error);
        toast({
          title: t("common.createPageFailed"),
          variant: "destructive",
        });
        throw error;
      }
      await linkAndNavigate(newPage, { initialContent: content });
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
        await linkAndNavigate(newPage);
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
