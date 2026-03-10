import React from "react";
import { Loader2, Trash2, Key } from "lucide-react";
import { Button } from "@zedi/ui";
import { Switch } from "@zedi/ui";
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
import { getProviderById } from "@/types/ai";
import { useTranslation } from "react-i18next";

interface AISettingsFormProps {
  /** When true, used inside settings hub; section title/description are provided by parent */
  embedded?: boolean;
}

export const AISettingsForm: React.FC<AISettingsFormProps> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const {
    settings,
    availableModels,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    showApiKey,
    setShowApiKey,
    useOwnKey,
    serverModels,
    serverModelsLoading,
    serverModelsError,
    isServerMode,
    loadServerModels,
    updateSettings,
    handleToggleOwnKey,
    handleServerModelSelect,
    handleTest,
    handleReset,
  } = useAISettingsForm();

  const currentProvider = getProviderById(settings.provider);
  const currentModelId = settings.modelId || `${settings.provider}:${settings.model}`;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {!embedded && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">{t("aiSettings.title")}</CardTitle>
          <CardDescription>{t("aiSettings.description")}</CardDescription>
        </CardHeader>
      )}

      <CardContent className={embedded ? "space-y-6 pt-0" : "space-y-6"}>
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

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("aiSettings.useOwnKey")}</p>
              <p className="text-xs text-muted-foreground">
                {t("aiSettings.useOwnKeyDescription")}
              </p>
            </div>
          </div>
          <Switch
            checked={useOwnKey}
            onCheckedChange={handleToggleOwnKey}
            disabled={isSaving || isTesting}
          />
        </div>

        {useOwnKey && (
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
