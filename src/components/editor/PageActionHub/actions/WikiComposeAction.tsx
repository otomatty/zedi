/**
 * `wiki.compose` PageActionHub detail view (#950).
 *
 * 分割画面 Compose へ遷移する。`ctx.wikiComposeHref` が無いときは説明のみ表示。
 *
 * Opens the Wiki Compose split-screen when `ctx.wikiComposeHref` is set.
 */
import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { PageActionComponentProps } from "../types";

/** Detail view for the wiki.compose hub action. */
export const WikiComposeAction: React.FC<PageActionComponentProps> = ({ ctx, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const href = ctx.wikiComposeHref?.trim() ?? "";

  const handleStart = useCallback(() => {
    if (!href) return;
    navigate(href);
    onClose();
  }, [href, navigate, onClose]);

  if (!href) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("editor.pageActionHub.actions.wikiCompose.unavailable")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {t("editor.pageActionHub.actions.wikiCompose.description")}
      </p>
      <Button
        type="button"
        className="gap-2"
        onClick={handleStart}
        data-testid="wiki-compose-start"
      >
        <Sparkles className="h-4 w-4" />
        {t("editor.pageActionHub.actions.wikiCompose.start")}
      </Button>
    </div>
  );
};
