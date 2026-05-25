/**
 * Settings section to register server-side BYOK API keys (#951).
 * 設定画面: Wiki Compose BYOK 用 API キー登録。
 */
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button, Input, Label, Alert, AlertDescription } from "@zedi/ui";
import {
  deleteUserAiCredential,
  fetchUserAiCredentialsStatus,
  upsertUserAiCredential,
  type UserAiCredentialProvider,
} from "@/lib/userAiCredentials";

const PROVIDERS: readonly { id: UserAiCredentialProvider; labelKey: string }[] = [
  { id: "anthropic", labelKey: "wikiCompose.credentials.anthropic" },
  { id: "openai", labelKey: "wikiCompose.credentials.openai" },
  { id: "google", labelKey: "wikiCompose.credentials.google" },
];

/**
 * Per-provider API key inputs backed by `/api/user/ai-credentials`.
 */
export const ComposeByokCredentialsSection: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [storageEnabled, setStorageEnabled] = useState(false);
  const [configured, setConfigured] = useState<Record<UserAiCredentialProvider, boolean>>({
    anthropic: false,
    openai: false,
    google: false,
  });
  const [draftKeys, setDraftKeys] = useState<Record<UserAiCredentialProvider, string>>({
    anthropic: "",
    openai: "",
    google: "",
  });
  const [showKey, setShowKey] = useState<Record<UserAiCredentialProvider, boolean>>({
    anthropic: false,
    openai: false,
    google: false,
  });
  const [saving, setSaving] = useState<UserAiCredentialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await fetchUserAiCredentialsStatus();
      setStorageEnabled(status.storageEnabled);
      const next: Record<UserAiCredentialProvider, boolean> = {
        anthropic: false,
        openai: false,
        google: false,
      };
      for (const p of status.providers) {
        next[p.provider] = p.configured;
      }
      setConfigured(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSave = async (provider: UserAiCredentialProvider) => {
    setSaving(provider);
    setError(null);
    try {
      await upsertUserAiCredential(provider, draftKeys[provider]);
      setDraftKeys((prev) => ({ ...prev, [provider]: "" }));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (provider: UserAiCredentialProvider) => {
    setSaving(provider);
    setError(null);
    try {
      await deleteUserAiCredential(provider);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!storageEnabled) {
    return (
      <Alert>
        <AlertDescription>{t("wikiCompose.credentials.storageDisabled")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6" data-testid="compose-byok-credentials">
      <p className="text-muted-foreground text-sm">{t("wikiCompose.credentials.description")}</p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {PROVIDERS.map(({ id, labelKey }) => (
        <div key={id} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`byok-${id}`}>{t(labelKey)}</Label>
            {configured[id] && (
              <span className="text-muted-foreground text-xs">
                {t("wikiCompose.credentials.configured")}
              </span>
            )}
          </div>
          <div className="relative">
            <Input
              id={`byok-${id}`}
              type={showKey[id] ? "text" : "password"}
              value={draftKeys[id]}
              onChange={(e) => setDraftKeys((prev) => ({ ...prev, [id]: e.target.value }))}
              placeholder={t("wikiCompose.credentials.placeholder")}
              disabled={saving === id}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowKey((prev) => ({ ...prev, [id]: !prev[id] }))}
              disabled={saving === id}
              aria-label={showKey[id] ? t("aiSettings.hideApiKey") : t("aiSettings.showApiKey")}
            >
              {showKey[id] ? (
                <EyeOff className="text-muted-foreground h-4 w-4" />
              ) : (
                <Eye className="text-muted-foreground h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave(id)}
              disabled={saving === id || !draftKeys[id].trim()}
            >
              {saving === id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
            </Button>
            {configured[id] && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleRemove(id)}
                disabled={saving === id}
              >
                {t("wikiCompose.credentials.remove")}
              </Button>
            )}
          </div>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">
        {t("wikiCompose.credentials.localStorageNote")}
      </p>
    </div>
  );
};
