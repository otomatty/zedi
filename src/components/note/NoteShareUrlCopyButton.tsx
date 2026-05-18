import React, { useCallback, useMemo } from "react";
import { Link2 } from "lucide-react";
import { Button, useToast } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { NoteVisibility } from "@/types/note";

/**
 * 共有 URL コピー用のアイコンボタンを表示すべき公開範囲。
 * Visibilities for which the share-URL copy button is meaningful.
 *
 * `private` / `restricted` は URL を知っていてもアクセスできないので、
 * 表示する意味がない。`public` / `unlisted` のみが対象。
 *
 * `private` and `restricted` notes cannot be opened by recipients even with
 * the URL, so we only surface the copy button for `public` / `unlisted`.
 */
const COPYABLE_VISIBILITIES: ReadonlySet<NoteVisibility> = new Set(["public", "unlisted"]);

/**
 * `NoteShareUrlCopyButton` の props。
 * Props for the share-URL copy button.
 */
export interface NoteShareUrlCopyButtonProps {
  /** 対象ノート ID。コピーする URL の組み立てに使う。 */
  noteId: string;
  /** 現在の公開範囲。`public` / `unlisted` のときだけボタンを表示する。 */
  visibility: NoteVisibility;
  /** 任意の追加クラス（レイアウト調整用）。 */
  className?: string;
}

/**
 * ノートタイトル横に置く共有 URL コピーボタン。共有モーダル廃止に伴い、
 * 「ノート画面から素早く URL をコピーしたい」動線を維持するための代替 UI。
 * `public` / `unlisted` のときだけ表示する（`private` / `restricted` では
 * URL を渡してもアクセスできず、押せても意味がないため）。
 *
 * Compact icon button placed next to the note title. Provides the
 * "copy URL from the note view" shortcut after the share modal was retired.
 * Only renders for `public` and `unlisted` notes since the URL alone does
 * not grant access on `private` / `restricted`.
 */
export const NoteShareUrlCopyButton: React.FC<NoteShareUrlCopyButtonProps> = ({
  noteId,
  visibility,
  className,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const noteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/notes/${noteId}`;
  }, [noteId]);

  const handleCopy = useCallback(async () => {
    if (!noteUrl) return;
    try {
      await navigator.clipboard.writeText(noteUrl);
      toast({ title: t("notes.linkCopied") });
    } catch (error) {
      console.error("Failed to copy share url:", error);
      toast({ title: t("notes.linkCopyFailed"), variant: "destructive" });
    }
  }, [noteUrl, t, toast]);

  if (!COPYABLE_VISIBILITIES.has(visibility)) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      aria-label={t("notes.copyShareUrlAria")}
      title={t("notes.copyShareUrlAria")}
      className={className}
    >
      <Link2 className="h-4 w-4" aria-hidden />
    </Button>
  );
};

export default NoteShareUrlCopyButton;
