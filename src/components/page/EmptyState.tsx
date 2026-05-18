import React from "react";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "@zedi/ui";
import { useCreateNewPage } from "@/hooks/useCreateNewPage";
import { useTranslation } from "react-i18next";

/**
 * Empty-state shown by `PageGrid` when the user has no pages. In a note
 * context (`noteId` provided) the CTA creates a page directly inside that
 * note via `useCreateNewPage({ noteId })`; otherwise it creates a personal
 * page. The visual layout (Sparkles + headline + CTA) is intentionally
 * shared so the note grid matches the legacy `/home` look.
 *
 * `PageGrid` がページを 1 件も持たないときに表示する空状態。`noteId` 渡し時
 * は CTA が同ノート内のページ作成に直行する。デザイン（Sparkles + 見出し +
 * CTA）はホームと統一する。
 */
const EmptyState: React.FC<{ noteId?: string }> = ({ noteId }) => {
  const { t } = useTranslation();
  const { createNewPage, isCreating } = useCreateNewPage(noteId ? { noteId } : undefined);

  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-4 py-24 text-center">
      <div className="from-primary/20 to-primary/5 mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br">
        <Sparkles className="text-primary h-10 w-10" />
      </div>

      <h2 className="mb-2 text-xl font-semibold">{t("common.page.emptyHomeTitle")}</h2>

      <p className="text-muted-foreground mb-8 max-w-md leading-relaxed">
        {t("common.page.emptyHomeLine1")}
        <br />
        {t("common.page.emptyHomeLine2")}
      </p>

      <Button onClick={createNewPage} disabled={isCreating} size="lg" className="shadow-glow gap-2">
        <Plus className="h-5 w-5" />
        {t("common.page.emptyHomeCta")}
      </Button>
    </div>
  );
};

export default EmptyState;
