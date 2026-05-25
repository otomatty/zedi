/**
 * Execution backend picker for Wiki Compose (#951).
 * Wiki Compose 用の実行 backend 選択 UI。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Label, RadioGroup, RadioGroupItem } from "@zedi/ui";
import {
  COMPOSE_BACKEND_META,
  type ComposeExecutionBackend,
  usesZediCu,
} from "@/lib/wikiCompose/backends";
import {
  fetchUserAiCredentialsStatus,
  type UserAiCredentialProvider,
} from "@/lib/userAiCredentials";

export interface ComposeBackendSelectorProps {
  value: ComposeExecutionBackend;
  onChange: (backend: ComposeExecutionBackend) => void;
  disabled?: boolean;
}

/**
 * Renders backend options; grays out BYOK choices without a stored credential.
 */
export const ComposeBackendSelector: React.FC<ComposeBackendSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [configuredProviders, setConfiguredProviders] = useState<Set<UserAiCredentialProvider>>(
    new Set(),
  );
  const [storageEnabled, setStorageEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchUserAiCredentialsStatus()
      .then((status) => {
        if (cancelled) return;
        setStorageEnabled(status.storageEnabled);
        const set = new Set<UserAiCredentialProvider>();
        for (const p of status.providers) {
          if (p.configured) set.add(p.provider);
        }
        setConfiguredProviders(set);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageEnabled(false);
          setConfiguredProviders(new Set());
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const availability = useMemo(() => {
    const map = new Map<ComposeExecutionBackend, boolean>();
    for (const meta of COMPOSE_BACKEND_META) {
      if (meta.provider === null) {
        map.set(meta.id, true);
      } else {
        map.set(meta.id, storageEnabled && configuredProviders.has(meta.provider));
      }
    }
    return map;
  }, [configuredProviders, storageEnabled]);

  return (
    <div className="space-y-2" data-testid="compose-backend-selector">
      <Label>{t("wikiCompose.backend.label")}</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as ComposeExecutionBackend)}
        className="flex flex-col gap-2"
        disabled={disabled}
      >
        {COMPOSE_BACKEND_META.map((meta) => {
          const available = availability.get(meta.id) ?? false;
          const itemDisabled = disabled || !available;
          return (
            <div
              key={meta.id}
              className={`flex items-start gap-2 rounded-md border p-3 ${
                itemDisabled ? "opacity-50" : ""
              }`}
            >
              <RadioGroupItem
                value={meta.id}
                id={`compose-backend-${meta.id}`}
                disabled={itemDisabled}
              />
              <label
                htmlFor={`compose-backend-${meta.id}`}
                className={`flex flex-1 cursor-pointer flex-col gap-0.5 ${itemDisabled ? "cursor-not-allowed" : ""}`}
              >
                <span className="text-sm font-medium">{t(meta.labelKey)}</span>
                <span className="text-muted-foreground text-xs">{t(meta.descriptionKey)}</span>
                {usesZediCu(meta.id) && (
                  <span className="text-muted-foreground text-xs">
                    {t("wikiCompose.backend.usesCu")}
                  </span>
                )}
                {!available && meta.provider !== null && (
                  <span className="text-destructive text-xs">
                    {t("wikiCompose.backend.credentialRequired")}
                  </span>
                )}
              </label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
};
