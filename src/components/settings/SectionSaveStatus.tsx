import React from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 *
 */
export type SectionSaveStatusState = "idle" | "saving" | "saved";

/**
 *
 */
export interface SectionSaveStatusProps {
  /** Current save status. Renders nothing when idle. */
  status: SectionSaveStatusState;
}

/**
 * Quiet per-section save indicator (no toast).
 * Shows "Saving…" or checkmark + "Saved". Parent should clear "saved" after a few seconds.
 * セクション単位の保存状態表示（Toast を使わない静かなフィードバック）
 */
export const SectionSaveStatus: React.FC<SectionSaveStatusProps> = ({ status }) => {
  const { t } = useTranslation();

  if (status === "idle") return null;

  if (status === "saving") {
    return (
      <div
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>{t("settings.saving")}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Check className="h-4 w-4 text-green-600 dark:text-green-500" aria-hidden />
      <span>{t("settings.saved")}</span>
    </div>
  );
};
