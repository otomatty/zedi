import React from "react";
import { type AIProviderType, type AICapabilities } from "@/types/ai";
import { RadioGroup, RadioGroupItem } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Badge } from "@zedi/ui";
import { Check, X, Monitor, Loader2 } from "lucide-react";
import { getVisibleProviders } from "@/lib/aiProviders/registry";
import { isTauriDesktop } from "@/lib/platform";
import { useTranslation } from "react-i18next";

interface ProviderSelectorProps {
  value: AIProviderType;
  onChange: (value: AIProviderType) => void;
  disabled?: boolean;
  /**
   * claude-code の利用可否（外部から注入）。
   * Claude Code availability (injected from parent).
   */
  claudeCodeAvailable?: boolean | null;
}

/**
 * AI プロバイダー選択コンポーネント。機能マトリクス付き（Issue #457）。
 * AI provider selector with capability matrix (Issue #457).
 */
export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  claudeCodeAvailable,
}) => {
  const { t } = useTranslation("aiSettings");
  const providers = getVisibleProviders();

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{t("providerLabel")}</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as AIProviderType)}
        className="grid grid-cols-1 gap-3"
        disabled={disabled}
      >
        {providers.map((provider) => {
          const isSelected = value === provider.id;
          const isClaudeCode = provider.id === "claude-code";
          const isDesktop = isTauriDesktop();

          const isUnavailable = isClaudeCode && (!isDesktop || claudeCodeAvailable === false);
          const isChecking = isClaudeCode && claudeCodeAvailable === null;

          return (
            <div
              key={provider.id}
              className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : isUnavailable
                    ? "border-border bg-muted/30 opacity-60"
                    : "border-border hover:bg-muted/50"
              }`}
            >
              <RadioGroupItem
                value={provider.id}
                id={`provider-${provider.id}`}
                disabled={disabled || isUnavailable}
                className="mt-1"
              />
              <div className="flex-1 space-y-2">
                <Label
                  htmlFor={`provider-${provider.id}`}
                  className={`flex cursor-pointer items-center gap-2 font-medium ${isUnavailable ? "cursor-not-allowed" : ""}`}
                >
                  {provider.name}
                  {provider.desktopOnly && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Monitor className="h-3 w-3" />
                      {t("desktopOnly")}
                    </Badge>
                  )}
                  {isClaudeCode && isChecking && (
                    <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
                  )}
                  {isClaudeCode && claudeCodeAvailable === false && (
                    <Badge variant="destructive" className="text-xs">
                      {t("providerUnavailable")}
                    </Badge>
                  )}
                  {isClaudeCode && claudeCodeAvailable === true && (
                    <Badge variant="secondary" className="text-xs">
                      {t("providerAvailable")}
                    </Badge>
                  )}
                </Label>
                {provider.description && (
                  <p className="text-muted-foreground text-xs">{provider.description}</p>
                )}
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
  const { t } = useTranslation("aiSettings");

  const entries: Array<{ key: keyof AICapabilities; label: string }> = [
    { key: "textGeneration", label: t("capabilityTextGeneration") },
    { key: "fileAccess", label: t("capabilityFileAccess") },
    { key: "commandExecution", label: t("capabilityCommandExecution") },
    { key: "webSearch", label: t("capabilityWebSearch") },
    { key: "mcpIntegration", label: t("capabilityMcpIntegration") },
    { key: "agentLoop", label: t("capabilityAgentLoop") },
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
