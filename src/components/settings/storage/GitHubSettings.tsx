import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { useTranslation } from "react-i18next";

export interface GitHubSettingsProps {
  repository: string;
  token: string;
  branch: string;
  path: string;
  onChange: (updates: Record<string, string>) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

export const GitHubSettings: React.FC<GitHubSettingsProps> = ({
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
