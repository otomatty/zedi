import React from "react";
import { Bot, Loader2, Trash2, Key, CheckCircle2, XCircle, Terminal } from "lucide-react";
import { Button } from "@zedi/ui";
import { Switch } from "@zedi/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@zedi/ui";
import { Alert, AlertDescription, AlertTitle } from "@zedi/ui";
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
import { getProviderById, type AIProviderType } from "@/types/ai";
import { useTranslation } from "react-i18next";

interface AISettingsFormProps {
  /** When true, used inside settings hub; section title/description are provided by parent */
  embedded?: boolean;
}

/**
 * AI settings form. Manages LLM provider, API key, and server model selection.
 * AI設定フォーム。LLMプロバイダー・APIキー・サーバーモデル選択を管理する。
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
    claudeCodeAvailable,
    loadServerModels,
    updateSettings,
    handleToggleOwnKey,
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

        <ProviderSelector
          value={settings.provider}
          onChange={(p: AIProviderType) => updateSettings({ provider: p })}
          disabled={isSaving || isTesting}
          claudeCodeAvailable={claudeCodeAvailable}
        />

        {!isClaudeCode && isServerMode && (
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

        {!isClaudeCode && (
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Key className="text-muted-foreground h-5 w-5" />
              <div>
                <p id="useOwnKey-label" className="text-sm font-medium">
                  {t("aiSettings.useOwnKey")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("aiSettings.useOwnKeyDescription")}
                </p>
              </div>
            </div>
            <Switch
              aria-labelledby="useOwnKey-label"
              checked={useOwnKey}
              onCheckedChange={handleToggleOwnKey}
              disabled={isSaving || isTesting}
            />
          </div>
        )}

        {useOwnKey && !isClaudeCode && (
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
        )}

        {isClaudeCode && <ClaudeCodeSection available={claudeCodeAvailable} />}
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
          {useOwnKey && !isClaudeCode && (
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
 * Claude Code プロバイダー選択時に表示するセクション。
 * Section displayed when the Claude Code provider is selected.
 */
function ClaudeCodeSection({ available }: { available: boolean | null }) {
  const { t } = useTranslation();

  if (available === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        <p className="text-muted-foreground text-sm">{t("aiSettings.checkingAvailability")}</p>
      </div>
    );
  }

  if (available) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>{t("aiSettings.providerAvailable")}</AlertTitle>
        <AlertDescription>
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            <span>{t("aiSettings.claudeCodeDescription")}</span>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <XCircle className="h-4 w-4" />
      <AlertTitle>{t("aiSettings.claudeCodeNotInstalled")}</AlertTitle>
      <AlertDescription>{t("aiSettings.claudeCodeDesktopRequired")}</AlertDescription>
    </Alert>
  );
}
