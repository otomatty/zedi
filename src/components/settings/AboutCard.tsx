import React from "react";
import { ExternalLink, Info } from "lucide-react";
import { Button } from "@zedi/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * About card: app version and release notes link.
 * 一般設定のAboutカード
 */
export function AboutCard(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          {t("generalSettings.about.title")}
        </CardTitle>
        <CardDescription>{t("generalSettings.about.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t("generalSettings.about.version")}:{" "}
          <span className="font-mono font-medium text-foreground">
            {import.meta.env.VITE_APP_VERSION ?? "—"}
          </span>
        </p>
        <Button variant="outline" size="sm" asChild className="w-fit">
          <a
            href="https://github.com/otomatty/zedi/releases"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("generalSettings.about.releaseNotes")}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
