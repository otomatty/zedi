import { GyazoSettings } from "./GyazoSettings";
import { GitHubSettings } from "./GitHubSettings";
import { GoogleDriveSettings } from "./GoogleDriveSettings";
import type { StorageSettingsFormContentProps } from "./storageSettingsFormTypes";

type Props = Pick<
  StorageSettingsFormContentProps,
  | "useExternalStorageEffective"
  | "settings"
  | "showSecrets"
  | "setShowSecrets"
  | "updateConfig"
  | "isSaving"
  | "isTesting"
>;

export function StorageProviderSpecificForms({
  useExternalStorageEffective,
  settings,
  showSecrets,
  setShowSecrets,
  updateConfig,
  isSaving,
  isTesting,
}: Props) {
  if (!useExternalStorageEffective) return null;
  const provider = settings.provider as string;
  if (provider === "gyazo") {
    return (
      <GyazoSettings
        accessToken={settings.config.gyazoAccessToken || ""}
        onChange={(value) => updateConfig({ gyazoAccessToken: value })}
        showSecrets={showSecrets}
        setShowSecrets={setShowSecrets}
        disabled={isSaving || isTesting}
      />
    );
  }
  if (provider === "github") {
    return (
      <GitHubSettings
        repository={settings.config.githubRepository || ""}
        token={settings.config.githubToken || ""}
        branch={settings.config.githubBranch || "main"}
        path={settings.config.githubPath || "images"}
        onChange={updateConfig}
        showSecrets={showSecrets}
        setShowSecrets={setShowSecrets}
        disabled={isSaving || isTesting}
      />
    );
  }
  if (provider === "google-drive") {
    return (
      <GoogleDriveSettings
        clientId={settings.config.googleDriveClientId || ""}
        clientSecret={settings.config.googleDriveClientSecret || ""}
        accessToken={settings.config.googleDriveAccessToken || ""}
        refreshToken={settings.config.googleDriveRefreshToken || ""}
        folderId={settings.config.googleDriveFolderId || ""}
        onChange={updateConfig}
        showSecrets={showSecrets}
        setShowSecrets={setShowSecrets}
        disabled={isSaving || isTesting}
      />
    );
  }
  return null;
}
