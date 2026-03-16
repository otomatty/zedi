import React, { useState } from "react";
import { Bot, Image as ImageIcon, Menu, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, cn } from "@zedi/ui";
import type { SettingsSectionId } from "@/components/settings/SettingsSection";

const SECTIONS: { id: SettingsSectionId; icon: React.ReactNode }[] = [
  { id: "general", icon: <Settings2 className="h-5 w-5" /> },
  { id: "ai", icon: <Bot className="h-5 w-5" /> },
  { id: "storage", icon: <ImageIcon className="h-5 w-5" /> },
];

/**
 * Props for SettingsHeaderNav. / 設定ヘッダーナビの props。
 */
export interface SettingsHeaderNavProps {
  /** Currently selected category. / 現在選択中のカテゴリ。 */
  value: SettingsSectionId;
  /** Called when user selects a category. / カテゴリ選択時に呼ばれる。 */
  onChange: (id: SettingsSectionId) => void;
  /** Optional className for the root. / ルートの className。 */
  className?: string;
}

/**
 * Settings category navigation for the settings page header.
 * Desktop: normal nav menu (horizontal links). Mobile: hamburger opens Sheet with category list.
 * 設定画面ヘッダー用のカテゴリナビ。デスクトップは通常のナビメニュー、スマホはハンバーガーで Sheet 表示。
 */
export const SettingsHeaderNav: React.FC<SettingsHeaderNavProps> = ({
  value,
  onChange,
  className,
}) => {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSelect = (id: SettingsSectionId) => {
    onChange(id);
    setSheetOpen(false);
  };

  return (
    <>
      {/* Mobile: hamburger button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("sm:hidden", className)}
        onClick={() => setSheetOpen(true)}
        aria-label={t("settings.summary.jumpTo")}
        aria-expanded={sheetOpen}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      {/* Desktop: normal nav menu */}
      <nav
        role="navigation"
        aria-label={t("settings.summary.jumpTo")}
        className={cn("hidden items-center gap-1 sm:flex", className)}
      >
        {SECTIONS.map(({ id, icon }) => {
          const isActive = value === id;
          const label = t(`settings.${id}.title`);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium",
                "ring-offset-background transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
              )}
            >
              {icon}
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile: Sheet with category list */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[min(100vw-2rem,20rem)]">
          <SheetHeader>
            <SheetTitle>{t("settings.summary.jumpTo")}</SheetTitle>
          </SheetHeader>
          <nav
            role="navigation"
            aria-label={t("settings.summary.jumpTo")}
            className="mt-6 flex flex-col gap-1"
          >
            {SECTIONS.map(({ id, icon }) => {
              const isActive = value === id;
              const label = t(`settings.${id}.title`);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-base font-medium",
                    "ring-offset-background transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                  )}
                >
                  {icon}
                  {label}
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
};
