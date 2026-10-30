import React from "react";
import { Bot, Loader2, Trash2, Server, Key } from "lucide-react";
import { Button } from "@zedi/ui";
import { RadioGroup, RadioGroupItem } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@zedi/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@zedi/ui";
import { useAISettingsForm } from "./useAISettingsForm";
import { AISettingsFormServerSection } from "./AISettingsFormServerSection";
import { AISettingsFormUserKeySection } from "./AISettingsFormUserKeySection";
import { ProviderSelector } from "./ProviderSelector";
import { SectionSaveStatus } from "./SectionSaveStatus";
import { getProviderById, type AIInteractionMode } from "@/types/ai";
import { useTranslation } from "react-i18next";
import { cn } from "@zedi/ui";

interface AISettingsFormProps {
  embedded?: boolean;
}

/**
 * AI settings form with a mode segment control (Default / API Key).
 * モード切り替え（既定 / API キー）付きの AI 設定フォーム。
 */
export const AISettingsForm: React.FC<AISettingsFormProps> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const {
    settings,
    availableModels,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    savedAt,
    showApiKey,
    setShowApiKey,
    useOwnKey,
    serverModels,
    serverModelsLoading,
    serverModelsError,
    isServerMode,
    interactionMode,
    loadServerModels,
    updateSettings,
    handleModeChange,
    handleServerModelSelect,
    handleTest,
    handleReset,
  } = useAISettingsForm();

  const currentProvider = getProviderById(settings.provider);
  const currentModelId = settings.modelId || `${settings.provider}:${settings.model}`;
  const saveStatus = isSaving ? "saving" : savedAt != null ? "saved" : "idle";

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {!embedded && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t("aiSettings.title")}
          </CardTitle>
          <CardDescription>{t("aiSettings.description")}</CardDescription>
        </CardHeader>
      )}

      <CardContent className={embedded ? "space-y-6 pt-0" : "space-y-6"}>
        {embedded && saveStatus !== "idle" && <SectionSaveStatus status={saveStatus} />}

        <ModeSelector
          value={interactionMode}
          onChange={handleModeChange}
          disabled={isSaving || isTesting}
        />

        {isServerMode && (
          <AISettingsFormServerSection
            serverModels={serverModels}
            serverModelsError={serverModelsError}
            serverModelsLoading={serverModelsLoading}
            currentModelId={currentModelId}
            isSaving={isSaving}
            onLoadServerModels={loadServerModels}
            onServerModelSelect={handleServerModelSelect}
          />
        )}

        {useOwnKey && (
          <>
            <ProviderSelector
              value={settings.provider}
              onChange={(p) => updateSettings({ provider: p })}
              disabled={isSaving || isTesting}
            />
            <AISettingsFormUserKeySection
              apiKey={settings.apiKey}
              provider={settings.provider}
              model={settings.model}
              availableModels={availableModels}
              currentProvider={currentProvider}
              showApiKey={showApiKey}
              onToggleShowApiKey={() => setShowApiKey(!showApiKey)}
              onUpdateSettings={updateSettings}
              isSaving={isSaving}
              isTesting={isTesting}
              testResult={testResult}
              embedded={embedded}
            />
          </>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isSaving || isTesting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("common.reset")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("aiSettings.resetConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("aiSettings.resetConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>{t("common.reset")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex gap-2">
          {useOwnKey && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isSaving || isTesting || !settings.apiKey}
            >
              {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("aiSettings.testConnection")}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

/**
 * モードのセグメントコントロール（RadioGroup ベース）。
 * Mode segment control using RadioGroup for proper a11y semantics.
 */
function ModeSelector({
  value,
  onChange,
  disabled,
}: {
  value: AIInteractionMode;
  onChange: (mode: AIInteractionMode) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();

  const modes: Array<{
    id: AIInteractionMode;
    label: string;
    icon: React.ReactNode;
    description: string;
  }> = [
    {
      id: "default",
      label: t("aiSettings.modeDefault"),
      icon: <Server className="h-4 w-4" />,
      description: t("aiSettings.modeDefaultDescription"),
    },
    {
      id: "user_api_key",
      label: t("aiSettings.modeApiKey"),
      icon: <Key className="h-4 w-4" />,
      description: t("aiSettings.modeApiKeyDescription"),
    },
  ];

  const modeGroupId = "ai-settings-interaction-mode";

  return (
    <fieldset className="space-y-2 border-0 p-0">
      <legend id={modeGroupId} className="text-sm font-medium">
        {t("aiSettings.modeLabel")}
      </legend>
      <RadioGroup
        aria-labelledby={modeGroupId}
        value={value}
        onValueChange={(v) => onChange(v as AIInteractionMode)}
        className="grid gap-2"
        disabled={disabled}
      >
        {modes.map((mode) => {
          const isSelected = value === mode.id;
          return (
            <div
              key={mode.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
              )}
            >
              <RadioGroupItem
                value={mode.id}
                id={`mode-${mode.id}`}
                disabled={disabled}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor={`mode-${mode.id}`}
                  className="flex cursor-pointer items-center gap-2"
                >
                  {mode.icon}
                  <span className="text-sm font-medium">{mode.label}</span>
                </Label>
                <p className="text-muted-foreground text-xs">{mode.description}</p>
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
