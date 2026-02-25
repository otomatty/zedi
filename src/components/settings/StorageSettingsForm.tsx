import React, { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
  Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
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
import { useStorageSettings } from "@/hooks/useStorageSettings";
import {
  EXTERNAL_STORAGE_PROVIDERS,
  StorageProviderType,
  getStorageProviderById,
  STORAGE_PROVIDERS,
} from "@/types/storage";
import type { StorageSettings } from "@/types/storage";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "@/components/ui/sonner";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useTranslation } from "react-i18next";

export const StorageSettingsForm: React.FC = () => {
  const { t } = useTranslation();
  const {
    settings,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    updateSettings: updateSettingsBase,
    updateConfig: updateConfigBase,
    save,
    test,
    reset,
  } = useStorageSettings();

  const [showSecrets, setShowSecrets] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const useExternalStorage = settings.preferDefaultStorage === false;
  // Legacy: cloudflare-r2 is no longer supported; treat as default storage for display
  const effectiveProvider = settings.provider === "cloudflare-r2" ? "s3" : settings.provider;
  const useExternalStorageEffective = useExternalStorage && settings.provider !== "cloudflare-r2";
  const currentProvider =
    getStorageProviderById(useExternalStorageEffective ? effectiveProvider : "s3") ??
    STORAGE_PROVIDERS[0];

  const getSafeReturnTo = useCallback((): string | null => {
    const returnTo = searchParams.get("returnTo");
    if (!returnTo) return null;
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
    return returnTo;
  }, [searchParams]);

  const runSave = useCallback(async () => {
    const success = await save();
    if (success) {
      sonnerToast.success(t("storageSettings.savedToast"), {
        description: t("storageSettings.savedToastDescription"),
      });
      const returnTo = getSafeReturnTo();
      if (returnTo) navigate(returnTo, { replace: true });
    } else {
      sonnerToast.error(t("common.error"), {
        description: t("storageSettings.saveFailedToastDescription"),
      });
    }
  }, [save, t, navigate, getSafeReturnTo]);
  const scheduleSave = useDebouncedCallback(runSave, 800);
  const updateSettings = useCallback(
    (updates: Partial<StorageSettings>) => {
      updateSettingsBase(updates);
      scheduleSave();
    },
    [updateSettingsBase, scheduleSave],
  );
  const updateConfig = useCallback(
    (updates: Partial<StorageSettings["config"]>) => {
      updateConfigBase(updates);
      scheduleSave();
    },
    [updateConfigBase, scheduleSave],
  );

  const handleTest = async () => {
    const result = await test();
    if (result.success) {
      toast({
        title: t("storageSettings.connectionSuccess"),
        description: result.message,
      });
    } else {
      toast({
        title: t("storageSettings.connectionFailed"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    reset();
    toast({
      title: t("storageSettings.resetToast"),
      description: t("storageSettings.resetToastDescription"),
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          {t("storageSettings.title")}
        </CardTitle>
        <CardDescription>{t("storageSettings.description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 保存先トグル: デフォルトストレージ / 外部ストレージ */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="prefer-default" className="text-base">
              {t("storageSettings.storageDestination")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {useExternalStorage
                ? t("storageSettings.saveToExternal")
                : t("storageSettings.saveToDefault")}
            </p>
          </div>
          <Switch
            id="prefer-default"
            checked={useExternalStorage}
            onCheckedChange={(checked) => updateSettings({ preferDefaultStorage: !checked })}
            disabled={isSaving || isTesting}
          />
        </div>

        {!useExternalStorageEffective && (
          <Alert>
            <AlertTitle>{t("storageSettings.defaultStorageAlertTitle")}</AlertTitle>
            <AlertDescription>
              {t("storageSettings.defaultStorageAlertDescription")}
            </AlertDescription>
          </Alert>
        )}

        {/* 外部ストレージ選択（外部を選んだときのみ表示） */}
        {useExternalStorageEffective && (
          <>
            <div className="space-y-2">
              <Label htmlFor="provider">{t("storageSettings.externalStorageLabel")}</Label>
              <Select
                value={effectiveProvider}
                onValueChange={(value) =>
                  updateSettings({ provider: value as StorageProviderType })
                }
                disabled={isSaving || isTesting}
              >
                <SelectTrigger id="provider">
                  <SelectValue placeholder={t("storageSettings.selectStorage")} />
                </SelectTrigger>
                <SelectContent>
                  {EXTERNAL_STORAGE_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className="flex flex-col items-start">
                          <span>{t(`storageSettings.providers.${provider.id}.name`)}</span>
                          <span className="text-xs text-muted-foreground">
                            {t(`storageSettings.providers.${provider.id}.description`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {t("storageSettings.difficultyLabel")}:{" "}
                            {t(`storageSettings.difficulty.${provider.setupDifficulty}`)}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {t(`storageSettings.providers.${provider.id}.freeTier`)}
                          </Badge>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentProvider && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {t("storageSettings.difficultyLabel")}:{" "}
                    {t(`storageSettings.difficulty.${currentProvider.setupDifficulty}`)}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t(`storageSettings.providers.${currentProvider.id}.freeTier`)}
                  </Badge>
                  <span>{t(`storageSettings.providers.${currentProvider.id}.description`)}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Provider-specific settings（外部ストレージのときのみ表示） */}
        {useExternalStorageEffective && settings.provider === "gyazo" && (
          <GyazoSettings
            accessToken={settings.config.gyazoAccessToken || ""}
            onChange={(value) => updateConfig({ gyazoAccessToken: value })}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            disabled={isSaving || isTesting}
          />
        )}

        {useExternalStorageEffective && settings.provider === "github" && (
          <GitHubSettings
            repository={settings.config.githubRepository || ""}
            token={settings.config.githubToken || ""}
            branch={settings.config.githubBranch || "main"}
            path={settings.config.githubPath || "images"}
            onChange={(updates) => updateConfig(updates)}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            disabled={isSaving || isTesting}
          />
        )}

        {useExternalStorageEffective && settings.provider === "google-drive" && (
          <GoogleDriveSettings
            clientId={settings.config.googleDriveClientId || ""}
            clientSecret={settings.config.googleDriveClientSecret || ""}
            accessToken={settings.config.googleDriveAccessToken || ""}
            refreshToken={settings.config.googleDriveRefreshToken || ""}
            folderId={settings.config.googleDriveFolderId || ""}
            onChange={(updates) => updateConfig(updates)}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            disabled={isSaving || isTesting}
          />
        )}

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
                ? t("storageSettings.connectionSuccess")
                : t("storageSettings.connectionFailed")}
            </AlertTitle>
            <AlertDescription>
              {testResult.message}
              {testResult.error && <span className="mt-1 block text-xs">{testResult.error}</span>}
            </AlertDescription>
          </Alert>
        )}

        {/* Setup Guide Link (外部ストレージのみ) */}
        {currentProvider && currentProvider.helpUrl && (
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
              <AlertDialogTitle>{t("storageSettings.resetConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("storageSettings.resetConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>{t("common.reset")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTest} disabled={isSaving || isTesting}>
            {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("storageSettings.testConnection")}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

// Gyazo Settings Component
interface GyazoSettingsProps {
  accessToken: string;
  onChange: (value: string) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

const GyazoSettings: React.FC<GyazoSettingsProps> = ({
  accessToken,
  onChange,
  showSecrets,
  setShowSecrets,
  disabled,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label htmlFor="gyazoAccessToken">{t("storageSettings.gyazo.accessTokenLabel")}</Label>
      <div className="relative">
        <Input
          id="gyazoAccessToken"
          type={showSecrets ? "text" : "password"}
          value={accessToken}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("storageSettings.gyazo.accessTokenPlaceholder")}
          disabled={disabled}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowSecrets(!showSecrets)}
        >
          {showSecrets ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <a
          href="https://gyazo.com/oauth/applications"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Gyazo OAuth Applications
        </a>
        {t("storageSettings.gyazo.getTokenHelp")}
      </p>
      <div className="mt-2 rounded-lg border border-border bg-muted/50 p-3">
        <p className="mb-1 text-xs font-medium">{t("storageSettings.gyazo.callbackUrlTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t("storageSettings.gyazo.callbackUrlDescription")}
        </p>
        <ul className="ml-4 mt-1 list-disc space-y-0.5 text-xs text-muted-foreground">
          <li>
            <code className="rounded bg-muted px-1">http://localhost:5173/callback</code>
          </li>
          <li>
            <code className="rounded bg-muted px-1">urn:ietf:wg:oauth:2.0:oob</code>
          </li>
          <li>
            <code className="rounded bg-muted px-1">zedi://oauth/callback</code>
          </li>
        </ul>
      </div>
    </div>
  );
};

// GitHub Settings Component
interface GitHubSettingsProps {
  repository: string;
  token: string;
  branch: string;
  path: string;
  onChange: (updates: Record<string, string>) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

const GitHubSettings: React.FC<GitHubSettingsProps> = ({
  repository,
  token,
  branch,
  path,
  onChange,
  showSecrets,
  setShowSecrets,
  disabled,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="githubRepository">{t("storageSettings.github.repository")}</Label>
        <Input
          id="githubRepository"
          type="text"
          value={repository}
          onChange={(e) => onChange({ githubRepository: e.target.value })}
          placeholder={t("storageSettings.github.repositoryPlaceholder")}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          {t("storageSettings.github.repositoryHelp")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="githubToken">{t("storageSettings.github.personalAccessToken")}</Label>
        <div className="relative">
          <Input
            id="githubToken"
            type={showSecrets ? "text" : "password"}
            value={token}
            onChange={(e) => onChange({ githubToken: e.target.value })}
            placeholder={t("storageSettings.github.tokenPlaceholder")}
            disabled={disabled}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowSecrets(!showSecrets)}
          >
            {showSecrets ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="githubBranch">{t("storageSettings.github.branch")}</Label>
          <Input
            id="githubBranch"
            type="text"
            value={branch}
            onChange={(e) => onChange({ githubBranch: e.target.value })}
            placeholder={t("storageSettings.github.branchPlaceholder")}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="githubPath">{t("storageSettings.github.path")}</Label>
          <Input
            id="githubPath"
            type="text"
            value={path}
            onChange={(e) => onChange({ githubPath: e.target.value })}
            placeholder={t("storageSettings.github.pathPlaceholder")}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};

// Google Drive Settings Component
interface GoogleDriveSettingsProps {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  folderId: string;
  onChange: (updates: Record<string, string>) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

const GoogleDriveSettings: React.FC<GoogleDriveSettingsProps> = ({
  clientId,
  clientSecret,
  accessToken,
  refreshToken,
  folderId,
  onChange,
  showSecrets,
  setShowSecrets,
  disabled,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>{t("storageSettings.googleDrive.oauthAlertTitle")}</AlertTitle>
        <AlertDescription className="text-xs">
          {t("storageSettings.googleDrive.oauthAlertDescription")}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-primary hover:underline"
          >
            {t("storageSettings.googleDrive.oauthAlertLink")}
          </a>
          {t("storageSettings.googleDrive.oauthAlertSuffix")}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="googleDriveClientId">{t("storageSettings.googleDrive.clientId")}</Label>
        <Input
          id="googleDriveClientId"
          type="text"
          value={clientId}
          onChange={(e) => onChange({ googleDriveClientId: e.target.value })}
          placeholder={t("storageSettings.googleDrive.clientIdPlaceholder")}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="googleDriveClientSecret">
          {t("storageSettings.googleDrive.clientSecret")}
        </Label>
        <div className="relative">
          <Input
            id="googleDriveClientSecret"
            type={showSecrets ? "text" : "password"}
            value={clientSecret}
            onChange={(e) => onChange({ googleDriveClientSecret: e.target.value })}
            placeholder={t("storageSettings.googleDrive.clientSecretPlaceholder")}
            disabled={disabled}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowSecrets(!showSecrets)}
          >
            {showSecrets ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="googleDriveAccessToken">
          {t("storageSettings.googleDrive.accessToken")}
        </Label>
        <Input
          id="googleDriveAccessToken"
          type={showSecrets ? "text" : "password"}
          value={accessToken}
          onChange={(e) => onChange({ googleDriveAccessToken: e.target.value })}
          placeholder={t("storageSettings.googleDrive.accessTokenPlaceholder")}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="googleDriveRefreshToken">
          {t("storageSettings.googleDrive.refreshToken")}
        </Label>
        <Input
          id="googleDriveRefreshToken"
          type={showSecrets ? "text" : "password"}
          value={refreshToken}
          onChange={(e) => onChange({ googleDriveRefreshToken: e.target.value })}
          placeholder={t("storageSettings.googleDrive.refreshTokenPlaceholder")}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="googleDriveFolderId">{t("storageSettings.googleDrive.folderId")}</Label>
        <Input
          id="googleDriveFolderId"
          type="text"
          value={folderId}
          onChange={(e) => onChange({ googleDriveFolderId: e.target.value })}
          placeholder={t("storageSettings.googleDrive.folderIdPlaceholder")}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          {t("storageSettings.googleDrive.folderIdHelp")}
        </p>
      </div>
    </div>
  );
};
