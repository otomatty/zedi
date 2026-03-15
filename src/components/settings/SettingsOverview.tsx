import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, Image as ImageIcon, Settings2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { SettingsSectionId as SectionId } from "./SettingsSection";

const SECTIONS: { id: SectionId; icon: React.ReactNode }[] = [
  { id: "general", icon: <Settings2 className="h-5 w-5" /> },
  { id: "ai", icon: <Bot className="h-5 w-5" /> },
  { id: "storage", icon: <ImageIcon className="h-5 w-5" /> },
];

/**
 * Props for SettingsOverview. Navigation-only; summaries are deprecated.
 * SettingsOverviewのプロパティ。ナビゲーション専用、summariesは非推奨。
 */
export interface SettingsOverviewProps {
  /** No longer displayed; kept for backward compatibility. Overview is navigation-only. / 表示されなくなりました。互換性のため残しています。概要はナビ専用です。 */
  summaries?: Record<SectionId, string>;
}

/** Renders overview cards (navigation only). Section summaries are shown in SettingsSection. / 概要カードを表示（ナビゲーション専用）。セクション要約は SettingsSection で表示。 */
export const SettingsOverview: React.FC<SettingsOverviewProps> = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const buildSectionHref = (id: SectionId): string => {
    const params = new URLSearchParams();
    params.set("section", id);
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      params.set("returnTo", returnTo);
    }
    return `/settings?${params.toString()}`;
  };

  const getTitle = (id: SectionId): string => t(`settings.${id}.title`);
  const getDescription = (id: SectionId): string => t(`settings.${id}.description`);

  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      role="navigation"
      aria-label={t("settings.summary.jumpTo")}
    >
      {SECTIONS.map(({ id, icon }) => (
        <Link
          key={id}
          to={buildSectionHref(id)}
          className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">{getTitle(id)}</CardTitle>
                <CardDescription className="text-sm">{getDescription(id)}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
};
