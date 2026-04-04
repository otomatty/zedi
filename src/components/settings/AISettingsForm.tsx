import React from "react";
import { Bot, Loader2, Trash2, Server, Key, Terminal } from "lucide-react";
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
import { ClaudeCodePrerequisites } from "./ClaudeCodePrerequisites";
import { getProviderById, type AIInteractionMode } from "@/types/ai";
import { isTauriDesktop } from "@/lib/platform";
import { useTranslation } from "react-i18next";
import { cn } from "@zedi/ui";

interface AISettingsFormProps {
  embedded?: boolean;
}

/**
 * AI settings form with 3-mode segment control (Default / API Key / Claude Code).
 * 3モードセグメントコントロール付きAI設定フォーム。
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
    isClaudeCode,
    interactionMode,
    claudeCodeAvailable,
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
  const isDesktop = isTauriDesktop();

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
          showClaudeCode={isDesktop}
          claudeCodeAvailable={claudeCodeAvailable}
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
              claudeCodeAvailable={claudeCodeAvailable}
              apiProvidersOnly
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

        {isClaudeCode && <ClaudeCodePrerequisites />}
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
 * 3-mode segment control (Default / API Key / Claude Code).
 * 3モードセグメントコントロール。
 */
/**
 * 3 モードセグメントコントロール（RadioGroup ベース）。
 * 3-mode segment control using RadioGroup for proper a11y semantics.
 */
function ModeSelector({
  value,
  onChange,
  disabled,
  showClaudeCode,
  claudeCodeAvailable,
}: {
  value: AIInteractionMode;
  onChange: (mode: AIInteractionMode) => void;
  disabled: boolean;
  showClaudeCode: boolean;
  claudeCodeAvailable: boolean | null;
}) {
  const { t } = useTranslation();

  const modes: Array<{
    id: AIInteractionMode;
    label: string;
    icon: React.ReactNode;
    description: string;
    itemDisabled?: boolean;
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

  if (showClaudeCode) {
    modes.push({
      id: "claude_code",
      label: t("aiSettings.modeClaudeCode"),
      icon: <Terminal className="h-4 w-4" />,
      description: t("aiSettings.modeClaudeCodeDescription"),
      itemDisabled: claudeCodeAvailable === false,
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("aiSettings.modeLabel")}</p>
      <RadioGroup
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
                isSelected
                  ? "border-primary bg-primary/5"
                  : mode.itemDisabled
                    ? "border-border bg-muted/30 opacity-60"
                    : "border-border hover:bg-muted/50",
              )}
            >
              <RadioGroupItem
                value={mode.id}
                id={`mode-${mode.id}`}
                disabled={disabled || mode.itemDisabled}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor={`mode-${mode.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2",
                    mode.itemDisabled && "cursor-not-allowed",
                  )}
                >
                  {mode.icon}
                  <span className="text-sm font-medium">{mode.label}</span>
                  {mode.id === "claude_code" && claudeCodeAvailable === false && (
                    <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-[10px]">
                      {t("aiSettings.providerUnavailable")}
                    </span>
                  )}
                  {mode.id === "claude_code" && claudeCodeAvailable === true && (
                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px]">
                      {t("aiSettings.providerAvailable")}
                    </span>
                  )}
                  {mode.id === "claude_code" && claudeCodeAvailable === null && (
                    <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
                  )}
                </Label>
                <p className="text-muted-foreground text-xs">{mode.description}</p>
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}
