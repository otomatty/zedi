import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
  Key,
  Server,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ProviderSelector } from "./ProviderSelector";
import { useAISettings } from "@/hooks/useAISettings";
import { getProviderById, type AIModel } from "@/types/ai";
import type { AISettings } from "@/types/ai";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "@/components/ui/sonner";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { fetchServerModels, FetchServerModelsError } from "@/lib/aiService";
import { useTranslation } from "react-i18next";

export const AISettingsForm: React.FC = () => {
  const { t } = useTranslation();
  const {
    settings,
    availableModels,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    updateSettings: updateSettingsBase,
    save,
    test,
    reset,
  } = useAISettings();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showApiKey, setShowApiKey] = useState(false);
  const [useOwnKey, setUseOwnKey] = useState(false);
  const [serverModels, setServerModels] = useState<AIModel[]>([]);
  const [serverModelsLoading, setServerModelsLoading] = useState(false);
  const [serverModelsError, setServerModelsError] = useState<string | null>(null);
  const { toast } = useToast();

  const isServerMode = settings.apiMode === "api_server" && !useOwnKey;

  // Load server models when in server mode
  const loadServerModels = useCallback(
    async (forceRefresh = false) => {
      console.debug("[AISettingsForm] loadServerModels called", { forceRefresh, isServerMode });
      setServerModelsError(null);
      setServerModelsLoading(true);
      try {
        const { models } = await fetchServerModels(forceRefresh);
        console.debug("[AISettingsForm] fetchServerModels resolved", {
          count: models?.length ?? 0,
        });
        setServerModels(models ?? []);
        if (!models?.length) {
          const msg = t("aiSettings.modelsEmpty");
          setServerModelsError(msg);
          console.debug("[AISettingsForm]", msg);
        }
      } catch (e) {
        const message =
          e instanceof FetchServerModelsError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        console.error("[AISettingsForm] loadServerModels failed", message, e);
        setServerModelsError(message);
        setServerModels([]);
      } finally {
        setServerModelsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (isServerMode) {
      console.debug("[AISettingsForm] isServerMode=true, loading server models");
      loadServerModels();
    }
  }, [isServerMode, loadServerModels]);

  // Initialize useOwnKey state from current settings
  useEffect(() => {
    if (!isLoading) {
      setUseOwnKey(settings.apiMode === "user_api_key");
    }
  }, [isLoading, settings.apiMode]);

  const currentProvider = getProviderById(settings.provider);

  const getSafeReturnTo = useCallback((): string | null => {
    const returnTo = searchParams.get("returnTo");
    if (!returnTo) return null;
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
    return returnTo;
  }, [searchParams]);

  const runSave = useCallback(async () => {
    const success = await save();
    if (success) {
      sonnerToast.success(t("aiSettings.savedToast"), {
        description: t("aiSettings.savedToastDescription"),
      });
      const returnTo = getSafeReturnTo();
      if (returnTo) navigate(returnTo, { replace: true });
    } else {
      sonnerToast.error(t("common.error"), {
        description: t("aiSettings.saveFailedToastDescription"),
      });
    }
  }, [save, t, navigate, getSafeReturnTo]);
  const scheduleSave = useDebouncedCallback(runSave, 800);
  const updateSettings = useCallback(
    (updates: Partial<AISettings>) => {
      updateSettingsBase(updates);
      scheduleSave();
    },
    [updateSettingsBase, scheduleSave],
  );

  const handleToggleOwnKey = (checked: boolean) => {
    setUseOwnKey(checked);
    updateSettings({
      apiMode: checked ? "user_api_key" : "api_server",
    });
  };

  const handleServerModelSelect = (modelId: string) => {
    const model = serverModels.find((m) => m.id === modelId);
    if (model) {
      updateSettings({
        provider: model.provider,
        model: model.modelId,
        modelId: model.id,
      });
    }
  };

  const handleTest = async () => {
    const result = await test();
    if (result.success) {
      toast({ title: t("aiSettings.connectionSuccess"), description: result.message });
    } else {
      toast({
        title: t("aiSettings.connectionFailed"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    reset();
    setUseOwnKey(false);
    toast({
      title: t("aiSettings.resetToast"),
      description: t("aiSettings.resetToastDescription"),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const availableServerModels = serverModels.filter((m) => m.available);
  const lockedServerModels = serverModels.filter((m) => !m.available);

  const minCostUnits = Math.max(
    1,
    Math.min(...serverModels.map((m) => m.inputCostUnits).filter((v) => v > 0)),
  );
  const getCostMultiplier = (model: AIModel) => {
    if (model.inputCostUnits <= 0) return 1;
    return Math.round(model.inputCostUnits / minCostUnits);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{t("aiSettings.title")}</CardTitle>
        <CardDescription>{t("aiSettings.description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ========== Server Mode (Default) ========== */}
        {isServerMode && (
          <>
            {/* Server Model Selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                <Label>{t("aiSettings.aiModel")}</Label>
              </div>

              {serverModelsError && (
                <Alert variant="destructive" className="flex flex-col gap-2">
                  <AlertTitle>{t("aiSettings.modelsLoadFailed")}</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap font-mono text-xs">
                    {serverModelsError}
                  </AlertDescription>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => loadServerModels(true)}
                  >
                    {t("aiSettings.retryLoadModels")}
                  </Button>
                </Alert>
              )}
              {serverModelsLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("aiSettings.loadingModels")}
                </div>
              ) : !serverModelsError ? (
                <Select
                  value={settings.modelId || `${settings.provider}:${settings.model}`}
                  onValueChange={handleServerModelSelect}
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("aiSettings.selectModel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableServerModels.length > 0 && (
                      <>
                        {availableServerModels.map((model) => {
                          const multiplier = getCostMultiplier(model);
                          return (
                            <SelectItem key={model.id} value={model.id}>
                              <div className="flex items-center gap-2">
                                <span>{model.displayName}</span>
                                <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                                  {model.provider}
                                </Badge>
                                <Badge
                                  variant={multiplier <= 1 ? "default" : "outline"}
                                  className="px-1 py-0 text-[10px]"
                                >
                                  {multiplier <= 1
                                    ? t("aiSettings.cheapest")
                                    : t("aiSettings.costLabel", { multiplier })}
                                </Badge>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </>
                    )}
                    {lockedServerModels.length > 0 && (
                      <>
                        {lockedServerModels.map((model) => {
                          const multiplier = getCostMultiplier(model);
                          return (
                            <SelectItem key={model.id} value={model.id} disabled>
                              <div className="flex items-center gap-2">
                                <Lock className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">{model.displayName}</span>
                                <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                  {t("aiSettings.pro")}
                                </Badge>
                                <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                  {multiplier <= 1
                                    ? t("aiSettings.cheapest")
                                    : t("aiSettings.costLabel", { multiplier })}
                                </Badge>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </>
                    )}
                  </SelectContent>
                </Select>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("aiSettings.serverModeHelp")}</p>
            </div>
          </>
        )}

        {/* ========== User API Key Mode Toggle ========== */}
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

        {/* ========== User API Key Mode ========== */}
        {useOwnKey && (
          <>
            {/* Provider Selection */}
            <ProviderSelector
              value={settings.provider}
              onChange={(provider) => updateSettings({ provider })}
              disabled={isSaving || isTesting}
            />

            {/* API Key Input */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">{t("aiSettings.apiKey")}</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={settings.apiKey}
                  onChange={(e) => updateSettings({ apiKey: e.target.value })}
                  placeholder={currentProvider?.placeholder}
                  disabled={isSaving || isTesting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* Model Selection (user key mode) */}
            <div className="space-y-2">
              <Label htmlFor="model">{t("aiSettings.model")}</Label>
              <Select
                value={settings.model}
                onValueChange={(model) => updateSettings({ model })}
                disabled={isSaving || isTesting}
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder={t("aiSettings.selectModel")} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("aiSettings.modelsAvailableAfterTest")}
              </p>
            </div>

            {/* Test Result */}
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
                <AlertDescription className="whitespace-pre-wrap">
                  {testResult.message}
                </AlertDescription>
              </Alert>
            )}

            {/* API Key Help */}
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
