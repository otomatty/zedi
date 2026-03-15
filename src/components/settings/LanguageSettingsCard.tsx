import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { LanguageSelectField } from "@/components/settings/LanguageSelectField";
import type { UILocale } from "@/types/generalSettings";

/**
 * Props for LanguageSettingsCard. 言語設定カードのプロパティ。
 */
export interface LanguageSettingsCardProps {
  locale: UILocale;
  onLocaleChange: (value: UILocale) => void;
}

/**
 * Language section card for General settings.
 * 一般設定の言語カード
 */
export function LanguageSettingsCard({ locale, onLocaleChange }: LanguageSettingsCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("generalSettings.language.title")}</CardTitle>
        <CardDescription>{t("generalSettings.language.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LanguageSelectField value={locale} onChange={onLocaleChange} id="locale" />
      </CardContent>
    </Card>
  );
}
