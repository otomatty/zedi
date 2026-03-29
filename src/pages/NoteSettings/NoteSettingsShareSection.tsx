import { Copy } from "lucide-react";
import { Button, Input } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 *
 */
export interface NoteSettingsShareSectionProps {
  noteUrl: string;
  onCopyLink: () => void;
}

/**
 *
 */
export function NoteSettingsShareSection({ noteUrl, onCopyLink }: NoteSettingsShareSectionProps) {
  /**
   *
   */
  const { t } = useTranslation();
  return (
    <section className="border-border/60 mt-6 rounded-lg border p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("notes.shareLink")}</h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input aria-label={t("notes.shareLink")} value={noteUrl} readOnly />
        <Button type="button" variant="outline" size="sm" onClick={onCopyLink}>
          <Copy className="mr-2 h-4 w-4" />
          {t("notes.copy")}
        </Button>
      </div>
    </section>
  );
}
