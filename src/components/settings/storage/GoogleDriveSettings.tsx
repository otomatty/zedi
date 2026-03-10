import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Alert, AlertDescription, AlertTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";

export interface GoogleDriveSettingsProps {
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

export const GoogleDriveSettings: React.FC<GoogleDriveSettingsProps> = ({
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
            aria-label={
              showSecrets ? t("storageSettings.hideSecrets") : t("storageSettings.showSecrets")
            }
            aria-pressed={showSecrets}
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
