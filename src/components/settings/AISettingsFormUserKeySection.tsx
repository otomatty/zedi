import React from "react";
import { Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@zedi/ui";
import { Alert, AlertDescription, AlertTitle } from "@zedi/ui";
import { ProviderSelector } from "./ProviderSelector";
import { CollapsibleHelp } from "./CollapsibleHelp";
import { ApiKeySourcesHelp } from "./ApiKeySourcesHelp";
import type { AIProvider } from "@/types/ai";
import { useTranslation } from "react-i18next";

interface AISettingsFormUserKeySectionProps {
  apiKey: string;
  provider: string;
  model: string;
  availableModels: string[];
  currentProvider: AIProvider | undefined;
  showApiKey: boolean;
  onToggleShowApiKey: () => void;
  onUpdateSettings: (updates: { provider?: string; apiKey?: string; model?: string }) => void;
  isSaving: boolean;
  isTesting: boolean;
  testResult: { success: boolean; message: string } | null;
  embedded: boolean;
}

export const AISettingsFormUserKeySection: React.FC<AISettingsFormUserKeySectionProps> = ({
  apiKey,
  provider,
  model,
  availableModels,
  currentProvider,
  showApiKey,
  onToggleShowApiKey,
  onUpdateSettings,
  isSaving,
  isTesting,
  testResult,
  embedded,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <ProviderSelector
        value={provider}
        onChange={(p) => onUpdateSettings({ provider: p })}
        disabled={isSaving || isTesting}
      />

      <div className="space-y-2">
        <Label htmlFor="apiKey">{t("aiSettings.apiKey")}</Label>
        <div className="relative">
          <Input
            id="apiKey"
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onUpdateSettings({ apiKey: e.target.value })}
            placeholder={currentProvider?.placeholder}
            disabled={isSaving || isTesting}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={onToggleShowApiKey}
            disabled={isSaving || isTesting}
            aria-label={showApiKey ? t("aiSettings.hideApiKey") : t("aiSettings.showApiKey")}
            aria-pressed={showApiKey}
          >
            {showApiKey ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="model">{t("aiSettings.model")}</Label>
        <Select
          value={model}
          onValueChange={(m) => onUpdateSettings({ model: m })}
          disabled={isSaving || isTesting}
        >
          <SelectTrigger id="model">
            <SelectValue placeholder={t("aiSettings.selectModel")} />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("aiSettings.modelsAvailableAfterTest")}</p>
      </div>

      {testResult && (
        <Alert variant={testResult.success ? "default" : "destructive"}>
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertTitle>
            {testResult.success
              ? t("aiSettings.connectionSuccess")
              : t("aiSettings.connectionFailed")}
          </AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{testResult.message}</AlertDescription>
        </Alert>
      )}

      {embedded ? (
        <CollapsibleHelp triggerLabel={t("aiSettings.apiKeySourcesExpand")}>
          <ApiKeySourcesHelp />
        </CollapsibleHelp>
      ) : (
        <ApiKeySourcesHelp />
      )}
    </>
  );
};
