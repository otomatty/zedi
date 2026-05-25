import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@zedi/ui";
import type { PageAction, PageActionContext } from "./types";

interface PageActionListProps {
  ctx: PageActionContext;
  actions: ReadonlyArray<PageAction>;
  onSelect: (actionId: string) => void;
}

/**
 * Step 1: 一覧グリッド。レジストリで `isAvailable` を通過したアクションを
 * アイコン + ラベル + 説明のカードで表示する。クリックで詳細ビューに遷移する。
 *
 * Step 1 of the hub: grid of action cards. Renders the actions that passed
 * the registry `isAvailable` gate as icon + label + description, and bubbles
 * selection up via `onSelect(actionId)`.
 */
export const PageActionList: React.FC<PageActionListProps> = ({ ctx: _ctx, actions, onSelect }) => {
  const { t } = useTranslation();

  if (actions.length === 0) {
    return (
      <div className="text-muted-foreground py-6 text-center text-sm">
        {t("editor.pageActionHub.emptyState")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {actions.map((action) => {
        const Icon = action.icon;
        const label = t(action.labelI18nKey);
        const description = action.descriptionI18nKey ? t(action.descriptionI18nKey) : null;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onSelect(action.id)}
            className={cn(
              "border-border bg-background hover:bg-accent",
              "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
            )}
          >
            <span className="bg-muted text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{label}</span>
              {description && (
                <span className="text-muted-foreground text-xs leading-snug">{description}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};
