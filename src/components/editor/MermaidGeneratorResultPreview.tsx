import { Label } from "@zedi/ui";
import { useTranslation } from "react-i18next";

interface MermaidGeneratorResultPreviewProps {
  code: string;
  previewSvg: string;
  previewError: string | null;
}

/**
 *
 */
export function MermaidGeneratorResultPreview({
  code,
  previewSvg,
  previewError,
}: MermaidGeneratorResultPreviewProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("mermaid.preview.generatedCode")}</Label>
        <pre className="bg-muted max-h-32 overflow-auto rounded-md p-3 font-mono text-sm">
          {code}
        </pre>
      </div>

      <div className="space-y-2">
        <Label>{t("mermaid.preview.previewLabel")}</Label>
        {previewError ? (
          <div className="bg-destructive/10 text-destructive rounded-md p-4 text-sm">
            {previewError}
          </div>
        ) : previewSvg ? (
          <div
            data-testid="preview-container"
            className="flex justify-center overflow-auto rounded-md border bg-white p-4 dark:bg-gray-900"
            dangerouslySetInnerHTML={{ __html: previewSvg }}
          />
        ) : (
          <div className="text-muted-foreground p-4 text-center">
            {t("mermaid.preview.loading")}
          </div>
        )}
      </div>
    </div>
  );
}
