import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 *
 */
export interface GyazoSettingsProps {
  accessToken: string;
  onChange: (value: string) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

/**
 *
 */
export /**
 *
 */
const GyazoSettings: React.FC<GyazoSettingsProps> = ({
  accessToken,
  onChange,
  showSecrets,
  setShowSecrets,
  disabled,
}) => {
  /**
   *
   */
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
          className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowSecrets(!showSecrets)}
          aria-label={
            showSecrets ? t("storageSettings.hideSecrets") : t("storageSettings.showSecrets")
          }
          aria-pressed={showSecrets}
        >
          {showSecrets ? (
            <EyeOff className="text-muted-foreground h-4 w-4" />
          ) : (
            <Eye className="text-muted-foreground h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
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
      <div className="border-border bg-muted/50 mt-2 rounded-lg border p-3">
        <p className="mb-1 text-xs font-medium">{t("storageSettings.gyazo.callbackUrlTitle")}</p>
        <p className="text-muted-foreground text-xs">
          {t("storageSettings.gyazo.callbackUrlDescription")}
        </p>
        <ul className="text-muted-foreground mt-1 ml-4 list-disc space-y-0.5 text-xs">
          <li>
            <code className="bg-muted rounded px-1">http://localhost:5173/callback</code>
          </li>
          <li>
            <code className="bg-muted rounded px-1">urn:ietf:wg:oauth:2.0:oob</code>
          </li>
          <li>
            <code className="bg-muted rounded px-1">zedi://oauth/callback</code>
          </li>
        </ul>
      </div>
    </div>
  );
};
