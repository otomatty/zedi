import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { StorageSettingsFormContentProps } from "./storageSettingsFormTypes";

type Props = Pick<StorageSettingsFormContentProps, "testResult" | "currentProvider">;

export function StorageTestResultAndGuide({ testResult, currentProvider }: Props) {
  const { t } = useTranslation();
  return (
    <>
      {testResult && (
        <Alert variant={testResult.success ? "default" : "destructive"}>
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertTitle>
            {testResult.success
              ? t("storageSettings.connectionSuccess")
              : t("storageSettings.connectionFailed")}
          </AlertTitle>
          <AlertDescription>
            {testResult.message}
            {testResult.error && <span className="mt-1 block text-xs">{testResult.error}</span>}
          </AlertDescription>
        </Alert>
      )}
      {currentProvider?.helpUrl && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <h4 className="mb-2 text-sm font-medium">{t("storageSettings.setupGuideTitle")}</h4>
          <a
            href={currentProvider.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {t("storageSettings.setupGuideLink", {
              name: t(`storageSettings.providers.${currentProvider.id}.name`),
            })}{" "}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </>
  );
}
