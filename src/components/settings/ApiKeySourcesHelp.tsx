import React from "react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

export const ApiKeySourcesHelp: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4">
      <h4 className="mb-2 text-sm font-medium">{t("aiSettings.apiKeySources")}</h4>
      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Google AI Studio <ExternalLink className="h-3 w-3" />
          </a>
        </li>
        <li>
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            OpenAI <ExternalLink className="h-3 w-3" />
          </a>
        </li>
        <li>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Anthropic <ExternalLink className="h-3 w-3" />
          </a>
        </li>
      </ul>
    </div>
  );
};
