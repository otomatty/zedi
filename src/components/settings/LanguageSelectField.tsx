import React from "react";
import { Label } from "@zedi/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { LOCALE_OPTIONS, type UILocale } from "@/types/generalSettings";

/**
 * Shared language/locale select field.
 * Used by Onboarding Step 2 and General settings language card.
 * 言語選択フィールド。オンボーディングと一般設定で共有。
 */
export interface LanguageSelectFieldProps {
  value: UILocale;
  onChange: (value: UILocale) => void;
  /** Optional id for the select trigger (e.g. "onboarding-locale"). / SelectTrigger の任意 id。 */
  id?: string;
  /** Optional id for the label (for aria-labelledby). / ラベルの任意 id（aria-labelledby 用）。 */
  labelId?: string;
  disabled?: boolean;
}

/**
 * Language/locale select field component.
 * 言語・ロケール選択フィールドコンポーネント。
 */
export const LanguageSelectField: React.FC<LanguageSelectFieldProps> = ({
  value,
  onChange,
  id = "locale",
  labelId,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <Label id={labelId} htmlFor={id}>
        {t("generalSettings.language.label")}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as UILocale)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full" aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
