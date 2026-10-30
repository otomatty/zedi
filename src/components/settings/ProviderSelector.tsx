import React from "react";
import { type AIProviderType, type AICapabilities } from "@/types/ai";
import { RadioGroup, RadioGroupItem } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Check, X } from "lucide-react";
import { getVisibleProviders } from "@/lib/aiProviders/registry";
import { useTranslation } from "react-i18next";

interface ProviderSelectorProps {
  value: AIProviderType;
  onChange: (value: AIProviderType) => void;
  disabled?: boolean;
}

/**
 * AI プロバイダー選択コンポーネント。機能マトリクス付き（Issue #457）。
 * AI provider selector with capability matrix (Issue #457).
 */
export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const providers = getVisibleProviders();

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{t("aiSettings.providerLabel")}</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as AIProviderType)}
        className="grid grid-cols-1 gap-3"
        disabled={disabled}
      >
        {providers.map((provider) => {
          const isSelected = value === provider.id;

          return (
            <div
              key={provider.id}
              className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <RadioGroupItem
                value={provider.id}
                id={`provider-${provider.id}`}
                disabled={disabled}
                className="mt-1"
              />
              <div className="flex-1 space-y-2">
                <Label
                  htmlFor={`provider-${provider.id}`}
                  className="flex cursor-pointer items-center gap-2 font-medium"
                >
                  {t(`aiSettings.providers.${provider.id}.name`)}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {t(`aiSettings.providers.${provider.id}.description`)}
                </p>
                {isSelected && <CapabilityMatrix capabilities={provider.capabilities} />}
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
};

/**
 * プロバイダーの機能マトリクスを表示するサブコンポーネント。
 * Sub-component that displays a provider's capability matrix.
 */
function CapabilityMatrix({ capabilities }: { capabilities: AICapabilities }) {
  const { t } = useTranslation();

  const entries: Array<{ key: keyof AICapabilities; label: string }> = [
    { key: "textGeneration", label: t("aiSettings.capabilityTextGeneration") },
    { key: "webSearch", label: t("aiSettings.capabilityWebSearch") },
  ];

  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
      {entries.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-1.5 text-xs">
          {capabilities[key] ? (
            <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
          ) : (
            <X className="text-muted-foreground h-3 w-3" />
          )}
          <span className={capabilities[key] ? "" : "text-muted-foreground"}>{label}</span>
        </div>
      ))}
    </div>
  );
}
